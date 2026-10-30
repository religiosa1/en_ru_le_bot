//! Warnings and mutes for language violations.
//!
//! Warnings are written in the other language: Russian on English days and vice versa.
//! It's a failsafe for users who can't read the other language yet, e.g. someone
//! writing in English gets a warning they can understand.
//!
//! By design, it's a scare tactic rather than a ban hammer:
//! - The warnings cooldown is common for all users (see `App::start_cooldown`), so during it
//!   other users' violations are neither warned about nor counted.
//! - Violations aren't reset by a mute: misbehaving again after one, before the violations
//!   expire, means a mute straight away, without warnings.

use chrono::Utc;
use teloxide::payloads::setters::*;
use teloxide::prelude::*;
use teloxide::types::{ChatPermissions, ReplyParameters, User};
use tracing::{error, info};

use crate::bot::App;
use crate::langday::{Lang, LangViolation};
use crate::state::{State, UserRef, Violation, now_ms};

/// Registers a violation, prolonging the expiry of earlier ones. Returns the number of violations.
fn register(state: &mut State, user_id: u64, username: Option<&str>, now: u64) -> u32 {
    let expires_at = now + state.settings.warnings_expiry.as_millis() as u64;
    let violation = state.violations.entry(user_id).or_insert(Violation {
        count: 0,
        username: None,
        expires_at,
    });
    violation.count += 1;
    violation.expires_at = expires_at;
    if let Some(username) = username {
        violation.username = Some(username.to_owned());
    }
    violation.count
}

/// Removes violations of a user, returns their id if there were any.
pub fn pardon(state: &mut State, user: &UserRef) -> Option<u64> {
    let id = user.find(&state.violations, |v| v.username.as_deref())?;
    state.violations.remove(&id);
    Some(id)
}

/// Removes all violations, returns ids of the users who had them.
pub fn pardon_all(state: &mut State) -> Vec<u64> {
    state.violations.drain().map(|(id, _)| id).collect()
}

/// Warns the user, or mutes them after too many warnings.
///
/// With mutes disabled, it's a warning only and the counter stays as is, so it can expire on its own.
pub async fn punish(
    bot: &Bot,
    app: &App,
    msg: &Message,
    user: &User,
    violation: &LangViolation,
) -> anyhow::Result<()> {
    let reply = |text: String| {
        bot.send_message(msg.chat.id, text)
            .reply_parameters(ReplyParameters::new(msg.id))
    };
    let warning = warning_message(violation.day);
    let settings = app.settings();
    if !settings.mute_enabled {
        reply(warning.into()).await?;
        info!("Warned user, mutes are disabled");
        return Ok(());
    }

    let count = app
        .store
        .update(|s| register(s, user.id.0, user.username.as_deref(), now_ms()))?;
    let max = settings.max_violations;
    if count <= max {
        reply(format!(
            "{warning}\n\n{}",
            count_message(violation.day, count, max - count)
        ))
        .await?;
        info!(count, max, "Warned user");
        return Ok(());
    }

    let until = Utc::now() + settings.mute_duration;
    let muted = bot
        .restrict_chat_member(app.chat_id, user.id, ChatPermissions::INVITE_USERS)
        .until_date(until)
        .await;
    let text = match muted {
        Ok(_) => {
            info!(count, max, %until, "Muted user");
            if violation.day == Some(Lang::En) {
                "Ты временно замьючен за неоднократные нарушения."
            } else {
                "You're temporarily muted for repeated violations."
            }
        }
        Err(err) => {
            error!(%err, count, max, "Error while muting user");
            if violation.day == Some(Lang::En) {
                "Ничего, в следующий раз тебя ещё достану."
            } else {
                "You're in luck, pal. I'll get to you next time."
            }
        }
    };
    reply(text.into()).await?;
    Ok(())
}

fn warning_message(day: Option<Lang>) -> &'static str {
    match day {
        Some(Lang::En) => "Эй, сегодня английский день. Постарайся говорить по-английски!",
        Some(Lang::Ru) => "Hey, today is a Russian day. Try to speak Russian!",
        None => "Only Russian and English are allowed in this chat.",
    }
}

fn count_message(day: Option<Lang>, count: u32, left: u32) -> String {
    match (day, left) {
        (Some(Lang::En), 0) => "Это последнее предупреждение.".into(),
        (Some(Lang::En), _) => format!("Это {count}-е предупреждение."),
        (_, 0) => "This is your last warning.".into(),
        _ => format!("This is your {} warning.", ordinal_en(count)),
    }
}

fn ordinal_en(n: u32) -> String {
    let suffix = match (n % 100, n % 10) {
        (11..=13, _) => "th",
        (_, 1) => "st",
        (_, 2) => "nd",
        (_, 3) => "rd",
        _ => "th",
    };
    format!("{n}{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::duration as dur;

    #[test]
    fn registers_violations_with_sliding_expiry() {
        let mut state = State::default();
        state.settings.warnings_expiry = dur::minutes(1);
        assert_eq!(register(&mut state, 1, Some("user"), 1000), 1);
        assert_eq!(register(&mut state, 1, None, 5000), 2);
        let violation = &state.violations[&1];
        assert_eq!(violation.expires_at, 65_000);
        assert_eq!(
            violation.username.as_deref(),
            Some("user"),
            "kept when missing later"
        );
    }

    #[test]
    fn pardons_by_id_or_username() {
        let mut state = State::default();
        register(&mut state, 1, Some("one"), 0);
        register(&mut state, 2, None, 0);
        register(&mut state, 3, None, 0);
        assert_eq!(
            pardon(&mut state, &UserRef::Username("One".into())),
            Some(1),
            "usernames are case-insensitive"
        );
        assert_eq!(pardon(&mut state, &UserRef::Username("one".into())), None);
        assert_eq!(pardon(&mut state, &UserRef::Id(2)), Some(2));
        assert_eq!(pardon_all(&mut state), [3]);
        assert!(state.violations.is_empty());
    }

    #[test]
    fn formats_ordinals() {
        let ordinals: Vec<_> = [1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111]
            .map(ordinal_en)
            .into();
        assert_eq!(
            ordinals,
            [
                "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st",
                "111th"
            ]
        );
    }
}
