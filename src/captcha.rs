//! Arithmetic captcha for newcomers: until it's solved, their messages are deleted,
//! and if it isn't solved in time, they're banned.

use std::hash::{BuildHasher, Hasher, RandomState};
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use teloxide::payloads::setters::*;
use teloxide::prelude::*;
use teloxide::types::{MessageId, ParseMode, User};
use tracing::{error, info};

use crate::bot::App;
use crate::duration::{self as dur, format_duration};
use crate::md;
use crate::members::welcome;
use crate::state::{Captcha, State, UserRef, now_ms};

/// Failed answers before a ban
const MAX_ATTEMPTS: u32 = 7;
const SWEEP_INTERVAL: Duration = dur::minutes(1);
/// Users who didn't solve the captcha in time may be slow humans, so they can retry later
const STALE_BAN_DURATION: Duration = dur::days(7);

struct Attempt {
    correct: bool,
    attempts: u32,
    question: String,
}

/// Adds a pending captcha, keeping bot messages of a previous one (e.g. the user left and rejoined) for cleanup.
fn add(
    state: &mut State,
    user: &User,
    question: String,
    answer: String,
    msg_id: MessageId,
    now: u64,
) {
    let mut msg_ids = state
        .captchas
        .remove(&user.id.0)
        .map_or_else(Vec::new, |c| c.msg_ids);
    msg_ids.push(msg_id.0);
    let captcha = Captcha {
        question,
        answer,
        username: user.username.clone(),
        asked_at: now,
        attempts: 0,
        msg_ids,
    };
    state.captchas.insert(user.id.0, captcha);
}

/// Registers an answer attempt, None if the user has no pending captcha.
fn attempt(state: &mut State, user_id: u64, answer: &str) -> Option<Attempt> {
    let captcha = state.captchas.get_mut(&user_id)?;
    captcha.attempts += 1;
    Some(Attempt {
        correct: answer.trim() == captcha.answer,
        attempts: captcha.attempts,
        question: captcha.question.clone(),
    })
}

/// Removes a pending captcha, returning bot messages to clean up.
fn remove(state: &mut State, user: &UserRef) -> Option<Vec<i32>> {
    let id = user.find(&state.captchas, |c| c.username.as_deref())?;
    state.captchas.remove(&id).map(|c| c.msg_ids)
}

/// Users who didn't solve their captcha since `asked_before` (unix ms), with their usernames.
fn stale(state: &State, asked_before: u64) -> Vec<(u64, Option<String>)> {
    state
        .captchas
        .iter()
        .filter(|(_, c)| c.asked_at < asked_before)
        .map(|(id, c)| (*id, c.username.clone()))
        .collect()
}

/// Random "a + b" question with its answer.
pub fn question_answer() -> (String, String) {
    // ponytail: std's random hasher seed as RNG, it's not a security boundary
    let random = RandomState::new().build_hasher().finish();
    let (a, b) = (random % 10 + 1, (random >> 32) % 10 + 1);
    (format!("{a} + {b}"), (a + b).to_string())
}

pub fn message(question: &str, user: &User, time_to_solve: Duration) -> String {
    let mention = md::mention(user);
    let time = md::escape(&format_duration(time_to_solve));
    md::fill(
        "{}

{}, please send the answer to the sum above.
If you don't do it within {}, we'll consider you a bot. Thank you!

{}, пожалуйста, напиши ответ на пример выше.
Если ты не сделаешь этого в течение {}, мы сочтём тебя ботом. Спасибо!",
        &[&md::escape(question), &mention, &time, &mention, &time],
    )
}

/// Asks the question again after a wrong answer.
pub fn retry_message(question: &str, user: &User, time_to_solve: Duration) -> String {
    md::fill(
        "Wrong answer, try again! / Неверный ответ, попробуй ещё раз!

{}",
        &[&message(question, user, time_to_solve)],
    )
}

/// Asks a newcomer to solve a captcha; bots are banned instead, unless allowed.
pub async fn on_join(bot: &Bot, app: &App, user: &User) -> anyhow::Result<()> {
    let settings = app.settings();
    if !settings.captcha_enabled {
        return Ok(());
    }
    if user.is_bot {
        if settings.captcha_bots_allowed {
            info!("Bots are allowed, no captcha for a joined bot");
        } else {
            bot.ban_chat_member(app.chat_id, user.id).await?;
            info!("Banned joined bot");
        }
        return Ok(());
    }
    let (question, answer) = question_answer();
    let msg = bot
        .send_message(
            app.chat_id,
            message(&question, user, settings.captcha_max_age),
        )
        .parse_mode(ParseMode::MarkdownV2)
        .await?;
    app.store
        .update(|s| add(s, user, question.clone(), answer, msg.id, now_ms()))?;
    info!(question, "Captcha sent");
    Ok(())
}

/// Handles a message of a user with a pending captcha, false if there's no captcha for them.
pub async fn on_message(bot: &Bot, app: &App, msg: &Message, user: &User) -> anyhow::Result<bool> {
    // Checked first, as updating means rewriting the state file
    if !app.settings().captcha_enabled || !app.store.read(|s| s.captchas.contains_key(&user.id.0)) {
        return Ok(false);
    }
    let text = msg.text().unwrap_or_default();
    let Some(attempt) = app.store.update(|s| attempt(s, user.id.0, text))? else {
        return Ok(false);
    };
    if let Err(err) = bot.delete_message(msg.chat.id, msg.id).await {
        error!(%err, "Failed to remove non-verified user's message");
    }

    let attempts = attempt.attempts;
    if attempt.correct {
        info!(attempts, "Captcha passed");
        remove_check(bot, app, &UserRef::Id(user.id.0)).await?;
        welcome(bot, app, user).await;
    } else if attempts >= MAX_ATTEMPTS {
        info!(attempts, text, "Captcha failed too many times, banning");
        bot.ban_chat_member(app.chat_id, user.id).await?;
        remove_check(bot, app, &UserRef::Id(user.id.0)).await?;
    } else {
        info!(
            attempts,
            text,
            question = attempt.question,
            "Wrong captcha answer"
        );
        let retry = retry_message(&attempt.question, user, app.settings().captcha_max_age);
        let sent = bot
            .send_message(app.chat_id, retry)
            .parse_mode(ParseMode::MarkdownV2)
            .await?;
        // Only the latest prompt stays in the chat. If the captcha was removed meanwhile
        // (sweep, /trust), nothing tracks the new prompt anymore, so it goes too.
        let stale_prompts = app
            .store
            .update(|s| {
                let captcha = s.captchas.get_mut(&user.id.0)?;
                Some(std::mem::replace(&mut captcha.msg_ids, vec![sent.id.0]))
            })?
            .unwrap_or_else(|| vec![sent.id.0]);
        delete_messages(bot, app, stale_prompts).await;
    }
    Ok(true)
}

/// Removes a pending captcha with its bot messages, if there's one.
///
/// Deleting the messages is best-effort, so a failure doesn't stop what follows, e.g. a ban.
pub async fn remove_check(bot: &Bot, app: &App, user: &UserRef) -> anyhow::Result<()> {
    let msg_ids = app.store.update(|s| remove(s, user))?.unwrap_or_default();
    delete_messages(bot, app, msg_ids).await;
    Ok(())
}

/// Deletes bot's captcha messages, best-effort.
async fn delete_messages(bot: &Bot, app: &App, msg_ids: Vec<i32>) {
    if !msg_ids.is_empty()
        && let Err(err) = bot
            .delete_messages(
                app.chat_id,
                msg_ids.into_iter().map(MessageId).collect::<Vec<_>>(),
            )
            .await
    {
        error!(%err, "Failed to delete captcha messages");
    }
}

/// Bans users who didn't solve their captcha in time, for [STALE_BAN_DURATION]. Runs forever.
///
/// With captcha disabled, their messages aren't checked anymore, so stale captchas are just dropped.
pub async fn sweep(bot: Bot, app: Arc<App>) {
    let mut interval = tokio::time::interval(SWEEP_INTERVAL);
    loop {
        interval.tick().await;
        let settings = app.settings();
        let max_age = settings.captcha_max_age.as_millis() as u64;
        let stale_ids = app
            .store
            .read(|s| stale(s, now_ms().saturating_sub(max_age)));
        for (user_id, username) in stale_ids {
            // Removing the record first, so a failing ban doesn't retry forever
            let result = async {
                remove_check(&bot, &app, &UserRef::Id(user_id)).await?;
                if settings.captcha_enabled {
                    bot.ban_chat_member(app.chat_id, UserId(user_id))
                        .until_date(Utc::now() + STALE_BAN_DURATION)
                        .await?;
                }
                anyhow::Ok(())
            };
            match result.await {
                Ok(()) if settings.captcha_enabled => info!(
                    user_id,
                    username,
                    ban_for = format_duration(STALE_BAN_DURATION),
                    "Captcha not solved in time, banned"
                ),
                Ok(()) => info!(
                    user_id,
                    username, "Captcha not solved in time, dropped as captcha is disabled"
                ),
                Err(err) => error!(
                    err = format!("{err:#}"),
                    user_id, username, "Error while processing stale captcha"
                ),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use teloxide::types::UserId;

    use super::*;

    fn user(id: u64, username: Option<&str>) -> User {
        User {
            id: UserId(id),
            is_bot: false,
            first_name: "First".into(),
            last_name: None,
            username: username.map(Into::into),
            language_code: None,
            is_premium: false,
            added_to_attachment_menu: false,
        }
    }

    #[test]
    fn verifies_answers() {
        let mut state = State::default();
        add(
            &mut state,
            &user(1, Some("newbie")),
            "2 + 3".into(),
            "5".into(),
            MessageId(10),
            0,
        );
        assert!(
            attempt(&mut state, 2, "5").is_none(),
            "no captcha for other users"
        );
        let wrong = attempt(&mut state, 1, "6").unwrap();
        assert!(!wrong.correct);
        let right = attempt(&mut state, 1, " 5 ").unwrap();
        assert!(right.correct);
        assert_eq!(right.attempts, 2);
        assert_eq!(
            remove(&mut state, &UserRef::Username("newbie".into())),
            Some(vec![10])
        );
        assert!(state.captchas.is_empty());
    }

    #[test]
    fn finds_stale_verifications() {
        let mut state = State::default();
        add(
            &mut state,
            &user(1, None),
            "q".into(),
            "a".into(),
            MessageId(1),
            1000,
        );
        add(
            &mut state,
            &user(2, None),
            "q".into(),
            "a".into(),
            MessageId(2),
            5000,
        );
        assert_eq!(stale(&state, 2000), [(1, None)]);
    }

    #[test]
    fn keeps_messages_of_a_previous_captcha() {
        let mut state = State::default();
        add(
            &mut state,
            &user(1, None),
            "1 + 1".into(),
            "2".into(),
            MessageId(1),
            0,
        );
        add(
            &mut state,
            &user(1, None),
            "2 + 2".into(),
            "4".into(),
            MessageId(2),
            10,
        );
        assert_eq!(state.captchas[&1].msg_ids, [1, 2]);
        assert_eq!(state.captchas[&1].answer, "4");
    }

    #[test]
    fn makes_valid_questions() {
        for _ in 0..100 {
            let (question, answer) = question_answer();
            let (a, b) = question.split_once(" + ").unwrap();
            let (a, b): (u64, u64) = (a.parse().unwrap(), b.parse().unwrap());
            assert!((1..=10).contains(&a) && (1..=10).contains(&b));
            assert_eq!(answer, (a + b).to_string());
        }
    }

    #[test]
    fn escapes_captcha_message() {
        let text = message("2 + 3", &user(42, Some("new_user")), dur::minutes(20));
        assert!(
            text.starts_with("2 \\+ 3\n\n[@new\\_user](tg://user?id=42), please send"),
            "{text}"
        );
        assert!(
            text.contains("within 20m, we'll consider you a bot\\. Thank you\\!"),
            "{text}"
        );
    }

    #[test]
    fn retry_repeats_the_question() {
        let text = retry_message("2 + 3", &user(42, Some("new_user")), dur::minutes(20));
        assert!(
            text.starts_with(
                "Wrong answer, try again\\! / Неверный ответ, попробуй ещё раз\\!\n\n2 \\+ 3\n\n"
            ),
            "{text}"
        );
    }
}
