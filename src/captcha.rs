//! Arithmetic captcha for newcomers: until it's solved, their messages are deleted,
//! and if it isn't solved in time, they're banned.

use std::hash::{BuildHasher, Hasher, RandomState};
use std::sync::Arc;
use std::time::Duration;

use teloxide::payloads::setters::*;
use teloxide::prelude::*;
use teloxide::types::{MessageId, ParseMode, User};
use tracing::{error, info};

use crate::bot::App;
use crate::duration::format_duration;
use crate::md;
use crate::members::welcome;
use crate::state::{Captcha, State, UserRef, now_ms};

/// Failed answers before a ban
const MAX_ATTEMPTS: u32 = 7;
/// The question is repeated every this many failed attempts
const REPEAT_QUESTION_EVERY: u32 = 3;
const SWEEP_INTERVAL: Duration = Duration::from_secs(60);

pub struct Attempt {
    pub correct: bool,
    pub attempts: u32,
    pub question: String,
}

pub fn add(state: &mut State, user: &User, question: String, answer: String, msg_id: MessageId, now: u64) {
    let captcha = Captcha {
        question,
        answer,
        username: user.username.clone(),
        asked_at: now,
        attempts: 0,
        msg_ids: vec![msg_id.0],
    };
    state.captchas.insert(user.id.0, captcha);
}

/// Registers an answer attempt, None if the user has no pending captcha.
pub fn attempt(state: &mut State, user_id: u64, answer: &str) -> Option<Attempt> {
    let captcha = state.captchas.get_mut(&user_id)?;
    captcha.attempts += 1;
    Some(Attempt {
        correct: answer.trim() == captcha.answer,
        attempts: captcha.attempts,
        question: captcha.question.clone(),
    })
}

/// Removes a pending captcha, returning bot messages to clean up.
pub fn remove(state: &mut State, user: &UserRef) -> Option<Vec<i32>> {
    let id = user.find(&state.captchas, |c| c.username.as_deref())?;
    state.captchas.remove(&id).map(|c| c.msg_ids)
}

/// Users who didn't solve their captcha since `asked_before` (unix ms).
pub fn stale(state: &State, asked_before: u64) -> Vec<u64> {
    state.captchas.iter().filter(|(_, c)| c.asked_at < asked_before).map(|(id, _)| *id).collect()
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

{}, please, send the solution to the arithmetic operation provided.
If you won't do it in {}, we'll consider you a bot. Thank you!

{}, пожалуйста, напиши сумму чисел в примере.
Если ты не сделаешь этого в течение {}, мы сочтём тебя ботом. Спасибо!",
        &[&md::escape(question), &mention, &time, &mention, &time],
    )
}

/// Asks a newcomer to solve a captcha; bots are banned instead, unless allowed.
pub async fn on_join(bot: &Bot, app: &App, user: &User) -> anyhow::Result<()> {
    let settings = app.settings();
    if !settings.captcha_enabled {
        return Ok(());
    }
    if user.is_bot {
        info!(user_id = user.id.0, "New joined user is a bot");
        if !settings.captcha_bots_allowed {
            bot.ban_chat_member(app.chat_id, user.id).await?;
        }
        return Ok(());
    }
    let (question, answer) = question_answer();
    let msg = bot
        .send_message(app.chat_id, message(&question, user, settings.captcha_max_age))
        .parse_mode(ParseMode::MarkdownV2)
        .await?;
    app.store.update(|s| add(s, user, question, answer, msg.id, now_ms()))?;
    info!(user_id = user.id.0, "Sent captcha check for the user");
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

    if attempt.correct {
        info!(user_id = user.id.0, "Captcha verification passed");
        remove_check(bot, app, &UserRef::Id(user.id.0)).await?;
        welcome(bot, app, user).await;
    } else if attempt.attempts >= MAX_ATTEMPTS {
        info!(user_id = user.id.0, text, "Too many failed captcha attempts, banning");
        bot.ban_chat_member(app.chat_id, user.id).await?;
        remove_check(bot, app, &UserRef::Id(user.id.0)).await?;
    } else {
        info!(user_id = user.id.0, text, "Captcha verification failed");
        if attempt.attempts % REPEAT_QUESTION_EVERY == 0 {
            let reminder = message(&attempt.question, user, app.settings().captcha_max_age);
            let sent = bot.send_message(app.chat_id, reminder).parse_mode(ParseMode::MarkdownV2).await?;
            app.store.update(|s| {
                if let Some(captcha) = s.captchas.get_mut(&user.id.0) {
                    captcha.msg_ids.push(sent.id.0);
                }
            })?;
        }
    }
    Ok(true)
}

/// Removes a pending captcha with its bot messages, if there's one.
pub async fn remove_check(bot: &Bot, app: &App, user: &UserRef) -> anyhow::Result<()> {
    let msg_ids = app.store.update(|s| remove(s, user))?.unwrap_or_default();
    if !msg_ids.is_empty() {
        bot.delete_messages(app.chat_id, msg_ids.into_iter().map(MessageId).collect::<Vec<_>>()).await?;
    }
    Ok(())
}

/// Bans users who didn't solve their captcha in time, runs forever.
pub async fn sweep(bot: Bot, app: Arc<App>) {
    let mut interval = tokio::time::interval(SWEEP_INTERVAL);
    loop {
        interval.tick().await;
        let max_age = app.settings().captcha_max_age.as_millis() as u64;
        let stale_ids = app.store.read(|s| stale(s, now_ms().saturating_sub(max_age)));
        for user_id in stale_ids {
            info!(user_id, "Stale captcha verification, banning");
            // Removing the record first, so a failing ban doesn't retry forever
            let result = async {
                remove_check(&bot, &app, &UserRef::Id(user_id)).await?;
                bot.ban_chat_member(app.chat_id, UserId(user_id)).await?;
                anyhow::Ok(())
            };
            if let Err(err) = result.await {
                error!(err = format!("{err:#}"), user_id, "Error while processing stale verification");
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
        add(&mut state, &user(1, Some("newbie")), "2 + 3".into(), "5".into(), MessageId(10), 0);
        assert!(attempt(&mut state, 2, "5").is_none(), "no captcha for other users");
        let wrong = attempt(&mut state, 1, "6").unwrap();
        assert!(!wrong.correct);
        let right = attempt(&mut state, 1, " 5 ").unwrap();
        assert!(right.correct);
        assert_eq!(right.attempts, 2);
        assert_eq!(remove(&mut state, &UserRef::Username("newbie".into())), Some(vec![10]));
        assert!(state.captchas.is_empty());
    }

    #[test]
    fn finds_stale_verifications() {
        let mut state = State::default();
        add(&mut state, &user(1, None), "q".into(), "a".into(), MessageId(1), 1000);
        add(&mut state, &user(2, None), "q".into(), "a".into(), MessageId(2), 5000);
        assert_eq!(stale(&state, 2000), [1]);
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
        let text = message("2 + 3", &user(42, Some("new_user")), Duration::from_secs(20 * 60));
        assert!(text.starts_with("2 \\+ 3\n\n[@new\\_user](tg://user?id=42), please"), "{text}");
        assert!(text.contains("in 20m, we'll consider you a bot\\. Thank you\\!"), "{text}");
    }
}
