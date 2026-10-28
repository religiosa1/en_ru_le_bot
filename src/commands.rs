//! Bot commands, "/name[@bot] [args]", working both in the chat and in DMs.

use std::ops::RangeInclusive;
use std::time::Duration;

use teloxide::payloads::setters::*;
use teloxide::prelude::*;
use teloxide::types::{BotCommand, ChatPermissions, MessageEntityKind, ParseMode, ReplyParameters, User};
use tracing::{info, warn};

use crate::bot::App;
use crate::duration::{format_duration, parse_duration};
use crate::langday::{Day, Lang, weekday_utc};
use crate::state::{Settings, UserRef, now_ms};
use crate::{captcha, members, violations};

const MAX_COOLDOWN: Duration = Duration::from_secs(3 * 60 * 60);
const MINUTE: Duration = Duration::from_secs(60);
const DAY: Duration = Duration::from_secs(24 * 60 * 60);
/// Telegram treats restrictions shorter than 30s or longer than 366 days as permanent
const MUTE_DURATION_RANGE: RangeInclusive<Duration> = Duration::from_secs(30)..=Duration::from_secs(366 * 24 * 60 * 60);
const WARNINGS_EXPIRY_RANGE: RangeInclusive<Duration> = MINUTE..=Duration::from_secs(366 * 24 * 60 * 60);
const CAPTCHA_TIME_RANGE: RangeInclusive<Duration> = MINUTE..=DAY;
/// Remaining cooldown is shown in /settings only if it's longer than this
const MIN_SHOWN_COOLDOWN: Duration = Duration::from_secs(3);
const DURATION_HINT: &str = r#"Try something like "3", "10m", "1m30s", etc."#;

#[derive(Debug, PartialEq)]
pub enum Access {
    Member,
    Admin,
    /// Admin-only, and not listed in the menu or /help
    Hidden,
}

#[derive(Debug)]
pub struct Spec {
    pub name: &'static str,
    pub description: &'static str,
    pub access: Access,
}

const fn spec(name: &'static str, description: &'static str, access: Access) -> Spec {
    Spec { name, description, access }
}

pub const COMMANDS: &[Spec] = &[
    spec("today", "check current day: whether it's English, Russian, or Free", Access::Member),
    spec("rules", "display the group's rules", Access::Member),
    spec("help", r#"["members"] display help on bot commands"#, Access::Member),
    spec("alarm", "Toggle notifications about day change on/off", Access::Admin),
    spec("langchecks", "Toggle en/ru days on/off", Access::Admin),
    spec("otherlang", "Toggle check for message language outside of en/ru on/off", Access::Admin),
    spec("forcelang", "[en|ru] Force a specific language", Access::Admin),
    spec("mute", "Toggle mutes on language violations on/off", Access::Admin),
    spec("pardon", "[@user] - Remove violations for specific user or all users", Access::Admin),
    spec("mute_duration", "[duration] - Set or view mute duration", Access::Admin),
    spec("warnings_expiry", "[duration] - Set or view warnings expiration time", Access::Admin),
    spec("warnings_number", "[int] - Set or view number of warnings before mute", Access::Admin),
    spec("cooldown", "[duration] Set cooldown value for wrong language warnings", Access::Admin),
    spec("settings", "display current bot settings", Access::Admin),
    spec("trust", "@username remove captcha check for a user", Access::Admin),
    spec("captcha", "toggle captcha check for newcomers on/off", Access::Admin),
    spec("captcha_time", "[duration] show or set time in which members must pass captcha check", Access::Admin),
    spec("captcha_bots", "toggle bots allowed on/off", Access::Admin),
    spec("flush_admins", "invalidate the admins cache", Access::Hidden),
    spec("rt", "<text> send text to the chat on behalf of the bot", Access::Hidden),
    spec("captcha_msg", "show captcha and welcome messages, to check their formatting", Access::Hidden),
    spec("captcha_clear", "remove all pending captcha checks", Access::Hidden),
];

pub struct Command<'a> {
    pub spec: &'static Spec,
    pub args: &'a str,
}

/// Parses a known command, None for regular messages, unknown commands and commands for other bots.
pub fn parse<'a>(text: &'a str, bot_username: &str) -> Option<Command<'a>> {
    let rest = text.strip_prefix('/')?;
    let (head, args) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
    let (name, addressee) = head.split_once('@').unwrap_or((head, bot_username));
    if !addressee.eq_ignore_ascii_case(bot_username) {
        return None;
    }
    let spec = COMMANDS.iter().find(|c| c.name == name)?;
    Some(Command { spec, args: args.trim() })
}

/// Commands for the bot menu: members get theirs, admins get admin ones as well.
pub fn menu(for_admins: bool) -> Vec<BotCommand> {
    COMMANDS
        .iter()
        .filter(|c| c.access == Access::Member || (for_admins && c.access == Access::Admin))
        .map(|c| BotCommand::new(c.name, c.description))
        .collect()
}

pub async fn handle(bot: &Bot, app: &App, msg: &Message, user: &User, command: Command<'_>) -> anyhow::Result<()> {
    let Command { spec, args } = command;
    info!(command = spec.name, args, user_id = user.id.0, "Command received");
    if spec.access != Access::Member && !app.is_admin(bot, user.id).await? {
        info!(user_id = user.id.0, "User not authorized to perform this request");
        return not_allowed(bot, app, msg, user).await;
    }
    if let Some(text) = run(bot, app, msg, user, spec.name, args).await? {
        bot.send_message(msg.chat.id, text).await?;
    }
    Ok(())
}

async fn not_allowed(bot: &Bot, app: &App, msg: &Message, user: &User) -> anyhow::Result<()> {
    if msg.chat.id == app.chat_id {
        let mention = user.username.as_ref().map(|u| format!("@{u} ")).unwrap_or_default();
        bot.send_message(msg.chat.id, format!("{mention}You're not allowed to do that!"))
            .reply_parameters(ReplyParameters::new(msg.id))
            .await?;
    } else {
        bot.send_message(msg.chat.id, "You're not allowed to do that!").await?;
    }
    Ok(())
}

/// Runs a command, returning the reply text, if any.
async fn run(bot: &Bot, app: &App, msg: &Message, user: &User, name: &str, args: &str) -> anyhow::Result<Option<String>> {
    let toggle = |field: fn(&mut Settings) -> &mut bool| {
        app.store.update(|s| {
            let value = field(&mut s.settings);
            *value = !*value;
            *value
        })
    };

    let reply = match name {
        "today" => today(&app.settings()).into(),
        "rules" => RULES.into(),
        "help" => help(args != "members" && app.is_admin(bot, user.id).await?),
        "settings" => settings(app),
        "alarm" => format!("Day change notifications are now {}", on_off(toggle(|s| &mut s.alarm_enabled)?)),
        "langchecks" => format!("Language checks are now {}", on_off(toggle(|s| &mut s.langday_checks)?)),
        "otherlang" => format!("Other language checks are now {}", on_off(toggle(|s| &mut s.otherlang_checks)?)),
        "mute" => format!("Mute on language violations is now {}", on_off(toggle(|s| &mut s.mute_enabled)?)),
        "captcha" => format!("Captcha checks for newcomers are now {}", on_off(toggle(|s| &mut s.captcha_enabled)?)),
        "captcha_bots" => match toggle(|s| &mut s.captcha_bots_allowed)? {
            true => "Bots can join now".into(),
            false => "Bots are forbidden to join now".into(),
        },
        "forcelang" => {
            let lang = match args.to_lowercase().as_str() {
                "" => None,
                "en" | "eng" | "english" => Some(Lang::En),
                "ru" | "rus" | "russian" => Some(Lang::Ru),
                _ => return Ok(Some(format!(r#"Unknown language "{args}""#))),
            };
            app.store.update(|s| s.settings.forced_lang = lang)?;
            match lang {
                Some(lang) => format!("Language is now forced to {}", lang.code()),
                None => "Forced day is now disabled.".into(),
            }
        }
        "mute_duration" => duration_setting(app, args, "Mute duration", MUTE_DURATION_RANGE, |s| &mut s.mute_duration)?,
        "warnings_expiry" => {
            duration_setting(app, args, "Warning expiry", WARNINGS_EXPIRY_RANGE, |s| &mut s.warnings_expiry)?
        }
        "captcha_time" => {
            duration_setting(app, args, "Captcha verification time", CAPTCHA_TIME_RANGE, |s| &mut s.captcha_max_age)?
        }
        "warnings_number" => match (args, args.parse::<u32>()) {
            ("", _) => format!("Maximum number of warnings is {}", app.settings().max_violations),
            (_, Err(_)) => "Maximum number of warnings must be a non-negative integer!".into(),
            (_, Ok(value)) => {
                app.store.update(|s| s.settings.max_violations = value)?;
                format!("Max warnings number is now {value}")
            }
        },
        "cooldown" => cooldown(app, args)?,
        "pardon" => match user_arg(msg, args) {
            Err(err) => err.into(),
            Ok(None) => {
                for user_id in app.store.update(violations::pardon_all)? {
                    restore_permissions(bot, app, user_id).await;
                }
                "Pardoned all users".into()
            }
            Ok(Some((target, name))) => match app.store.update(|s| violations::pardon(s, &target))? {
                Some(user_id) => {
                    restore_permissions(bot, app, user_id).await;
                    format!("Pardoned user @{name}")
                }
                None => format!("Unable to find any violations for the {name}"),
            },
        },
        "trust" => match user_arg(msg, args) {
            Err(err) => err.into(),
            Ok(None) => "username is required in this command".into(),
            Ok(Some((target, name))) => {
                captcha::remove_check(bot, app, &target).await?;
                format!("Ok, user @{name} is now trusted")
            }
        },
        "flush_admins" => {
            app.refresh_admins(bot).await?;
            "List of admins refreshed".into()
        }
        "captcha_clear" => {
            app.store.update(|s| s.captchas.clear())?;
            "Removed all pending captcha checks".into()
        }
        "captcha_msg" => {
            let (question, _) = captcha::question_answer();
            for text in [captcha::message(&question, user, app.settings().captcha_max_age), members::welcome_message(user)] {
                bot.send_message(msg.chat.id, text).parse_mode(ParseMode::MarkdownV2).await?;
            }
            return Ok(None);
        }
        "rt" => {
            if !args.is_empty() {
                bot.send_message(app.chat_id, args).await?;
            }
            return Ok(None);
        }
        _ => unreachable!("command {name} is in COMMANDS, but isn't handled"),
    };
    Ok(Some(reply))
}

fn today(settings: &Settings) -> &'static str {
    match Day::of(settings, weekday_utc(now_ms())) {
        Day::Disabled => "Language checks are disabled by admins\n\nПроверка языка выключена администраторами.",
        Day::Forced(Lang::En) => "English day was forced by admins",
        Day::Forced(Lang::Ru) => "Русский день принудительно выставлен администраторами",
        Day::Scheduled(None) => {
            "Today is a free day. You can speak Russian or English language.\n\n\
             Сегодня свободный день. Вы можете говорить на русском или английском."
        }
        Day::Scheduled(Some(Lang::En)) => "Today is an English day",
        Day::Scheduled(Some(Lang::Ru)) => "Сегодня русский день",
    }
}

fn help(with_admin_commands: bool) -> String {
    let mut text = String::new();
    for c in COMMANDS.iter().filter(|c| c.access == Access::Member || (with_admin_commands && c.access == Access::Admin)) {
        let suffix = if c.access == Access::Admin { " (admin-only)" } else { "" };
        text += &format!("- /{} {}{suffix}\n", c.name, c.description);
    }
    text
}

fn on_off(value: bool) -> &'static str {
    if value { "on" } else { "off" }
}

/// Shows a duration setting without args, or sets it.
fn duration_setting(
    app: &App,
    args: &str,
    label: &str,
    range: RangeInclusive<Duration>,
    field: fn(&mut Settings) -> &mut Duration,
) -> anyhow::Result<String> {
    if args.is_empty() {
        return Ok(format!("{label} is {}", format_duration(*field(&mut app.settings()))));
    }
    let duration = match parse_bounded_duration(args, &range) {
        Ok(duration) => duration,
        Err(reply) => return Ok(reply),
    };
    app.store.update(|s| *field(&mut s.settings) = duration)?;
    Ok(format!("{label} is now {}", format_duration(duration)))
}

/// Parses a duration within the range, or returns a reply explaining what's wrong.
fn parse_bounded_duration(args: &str, range: &RangeInclusive<Duration>) -> Result<Duration, String> {
    let duration = parse_duration(args).ok_or_else(|| format!(r#"Incorrect value "{args}". {DURATION_HINT}"#))?;
    if !range.contains(&duration) {
        let (min, max) = (format_duration(*range.start()), format_duration(*range.end()));
        return Err(format!("The value must be between {min} and {max}"));
    }
    Ok(duration)
}

fn settings(app: &App) -> String {
    let s = app.settings();
    let mut text = format!(
        "en/ru days checks: {}\n\
         other lang checks: {}\n\
         forced language: {}\n\
         mute capacity: {}\n\
         mute duration: {}\n\
         warnings number: {}\n\
         warnings expiry: {}\n\
         cooldown: {}\n\
         captcha: {}\n\
         captcha verification time: {}\n\
         captcha bots allowed: {}\n\
         day change notifications: {}",
        on_off(s.langday_checks),
        on_off(s.otherlang_checks),
        s.forced_lang.map_or("none", Lang::code),
        on_off(s.mute_enabled),
        format_duration(s.mute_duration),
        s.max_violations,
        format_duration(s.warnings_expiry),
        format_duration(s.cooldown),
        on_off(s.captcha_enabled),
        format_duration(s.captcha_max_age),
        on_off(s.captcha_bots_allowed),
        on_off(s.alarm_enabled),
    );
    let remaining = app.remaining_cooldown();
    if remaining > MIN_SHOWN_COOLDOWN {
        text += &format!("\ncurrent cooldown for: {}", format_duration(Duration::from_secs(remaining.as_secs())));
    }
    text
}

/// Without args resets the cooldown to the default value, and ends the current one.
fn cooldown(app: &App, args: &str) -> anyhow::Result<String> {
    if args.is_empty() {
        let default = app.reset_cooldown()?;
        return Ok(format!("Setting cooldown to the default value of {}", format_duration(default)));
    }
    let Some(cooldown) = parse_duration(args) else {
        return Ok(format!(r#"Wrong cooldown duration value: "{args}". {DURATION_HINT}"#));
    };
    if cooldown > MAX_COOLDOWN {
        return Ok(format!("Cooldown must be in range between 0 and {}", format_duration(MAX_COOLDOWN)));
    }
    app.set_cooldown(cooldown)?;
    Ok(format!("Cooldown between warnings is now {}", format_duration(cooldown)))
}

/// User from command args: a text mention (for users without a username) or an @username,
/// along with a name to display.
fn user_arg(msg: &Message, args: &str) -> Result<Option<(UserRef, String)>, &'static str> {
    if args.is_empty() {
        return Ok(None);
    }
    let text_mention = msg.parse_entities().into_iter().flatten().find_map(|entity| match entity.kind() {
        MessageEntityKind::TextMention { user } => Some(user.clone()),
        _ => None,
    });
    if let Some(user) = text_mention {
        return Ok(Some((UserRef::Id(user.id.0), user.first_name)));
    }
    let username = args.strip_prefix('@').ok_or("username mention must start from @")?;
    Ok(Some((UserRef::Username(username.into()), username.into())))
}

async fn restore_permissions(bot: &Bot, app: &App, user_id: u64) {
    if let Err(err) = bot.restrict_chat_member(app.chat_id, UserId(user_id), ChatPermissions::all()).await {
        warn!(%err, user_id, "Error restoring chat permissions, but warnings successfully removed");
    }
}

const RULES: &str = "This chat is made for English and Russian practice.
On Monday, Wednesday and Friday Russian is spoken. On Tuesday, Thursday and Saturday English is spoken. On Sunday you can speak any of these two languages. It is expected from native speakers to correct other people's mistakes.

The day is changed at 00:00 CET (Berlin).

DO NOT WRITE TO OTHER MEMBERS DIRECTLY BEFORE YOU AT LEAST KNOW THEM. Better don't write them at all until you're pretty confident you're not bugging them. This is highly discouraged and will be punished.

Rudeness, trolling, harassment, harassment in DM, antisocial behaviour and so on may lead to a ban. It's not a court room, but a community. It is possible to get a ban just because we don't like you -- be polite. Write to the admins if someone is bothering you, so the admins may settle the situation.
Cursing is not forbidden, but that doesn't mean you need to use it constantly.

The chat bot may temporarily mute you for repeated violations of the Russian/English day rules.

IMPORTANT: Language Exchange implies that you can understand most of what is written to you and can answer. You came here to talk, so try to talk.
======================
Данный чат предназначен для практики английского или русского языков.

В понедельник, среду и пятницу говорим по-русски. Во вторник, четверг и субботу -- по-английски. В воскресенье допустимо использование любого из этих языков. От носителей ожидаются исправления ошибок у других людей.

Смена дня происходит в 00:00 Центральноевропейского времени (Берлин).

НЕ ПИШИТЕ ДРУГИМ УЧАСТНИКАМ В ЛИЧКУ ПОКА ВЫ С НИМИ ХОТЯ БЫ НЕ ПОЗНАКОМИТЕСЬ. Лучше вообще им не пишите, пока вы не достаточно уверены, что вы им не докучаете. Такое поведение крайне неодобряется и будет караться.

За грубость, троллинг, домогательства, домогания в личке, антисоциальное поведение и т.д. возможен бан. У нас не зал суда, а сообщество. Бан возможен просто за то что вы не понравились -- будьте вежливы. Если вам кто-то докучает, пишите админам, чтобы админы могли урегулировать ситуацию.
Использование мата не запрещено, но это не значит что нужно использовать его постоянно.

Бот может вас замьютить за повторные нарушения порядка Русских/Английских дней.

ВАЖНО: языковой обмен подразумевает, что вы понимаете большую часть того, что вам пишут и можете отвечать. Вы пришли сюда общаться -- пытайтесь общаться.

======================
If you don't understand if today is an English or Russian day write /today
Or take a look at this picture.

https://i.ibb.co/kK6tYNG/days-all.png

=====================

Unwanted advertisement and self-promotion may lead to a permanent ban. Please ask the members if they are interested in what you're selling first.";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_commands() {
        let parse = |text| parse(text, "en_ru_le_bot").map(|c| (c.spec.name, c.args));
        assert_eq!(parse("/help"), Some(("help", "")));
        assert_eq!(parse("/help@en_ru_le_bot members"), Some(("help", "members")));
        assert_eq!(parse("/forcelang  en "), Some(("forcelang", "en")));
        assert_eq!(parse("/help@other_bot"), None, "addressed to another bot");
        assert_eq!(parse("/start"), None, "unknown");
        assert_eq!(parse("help"), None);
    }

    #[test]
    fn builds_menus() {
        let names = |menu: Vec<BotCommand>| menu.into_iter().map(|c| c.command).collect::<Vec<_>>();
        assert_eq!(names(menu(false)), ["today", "rules", "help"]);
        let admin_menu = names(menu(true));
        assert!(admin_menu.contains(&"today".into()) && admin_menu.contains(&"settings".into()));
        assert!(!admin_menu.contains(&"rt".into()), "hidden commands aren't listed");
    }

    #[test]
    fn bounds_durations() {
        assert_eq!(parse_bounded_duration("15", &MUTE_DURATION_RANGE), Ok(Duration::from_secs(15 * 60)));
        assert!(parse_bounded_duration("10s", &MUTE_DURATION_RANGE).is_err(), "Telegram makes it permanent");
        assert!(parse_bounded_duration("400d", &MUTE_DURATION_RANGE).is_err());
        assert!(parse_bounded_duration("99999999999d", &WARNINGS_EXPIRY_RANGE).is_err(), "no overflow");
        assert!(parse_bounded_duration("0", &CAPTCHA_TIME_RANGE).is_err());
        assert!(parse_bounded_duration("nope", &CAPTCHA_TIME_RANGE).is_err());
    }

    #[test]
    fn command_names_are_valid() {
        for c in COMMANDS {
            assert!(c.name.len() <= 32 && c.name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'));
        }
    }
}
