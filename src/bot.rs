//! Shared bot state and the pipeline for text messages.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::Utc;
use teloxide::prelude::*;
use tracing::{debug, info};

use crate::duration as dur;
use crate::langday::{check_message, weekday_utc};
use crate::lid::Lid;
use crate::members::WelcomeState;
use crate::state::{Settings, Store, now_ms};
use crate::{captcha, commands, members, violations};

const ADMINS_CACHE_TTL: Duration = dur::hours(3);

/// Telegram can send a lot of updates we missed while being down, those aren't checked.
const MESSAGE_AGE_THRESHOLD: chrono::TimeDelta = chrono::TimeDelta::minutes(5);

pub struct App {
    pub store: Store,
    pub lid: Lid,
    pub chat_id: ChatId,
    /// For commands addressed to a specific bot, e.g. "/help@en_ru_le_bot"
    pub bot_username: String,
    admins: Mutex<Option<(Vec<UserId>, Instant)>>,
    /// Unix ms; no warnings are issued until then. In memory, as it's short-lived.
    cooldown_until: Mutex<Option<u64>>,
    pub welcome: Mutex<WelcomeState>,
}

impl App {
    pub fn new(store: Store, lid: Lid, chat_id: ChatId, bot_username: String) -> Self {
        Self {
            store,
            lid,
            chat_id,
            bot_username,
            admins: Mutex::default(),
            cooldown_until: Mutex::default(),
            welcome: Mutex::default(),
        }
    }

    pub fn settings(&self) -> Settings {
        self.store.read(|s| s.settings.clone())
    }

    /// Whether a user is an admin of the target chat, with admins cached.
    pub async fn is_admin(&self, bot: &Bot, user_id: UserId) -> anyhow::Result<bool> {
        if let Some((ids, refreshed_at)) = &*self.admins.lock().unwrap()
            && refreshed_at.elapsed() < ADMINS_CACHE_TTL
        {
            return Ok(ids.contains(&user_id));
        }
        Ok(self.refresh_admins(bot).await?.contains(&user_id))
    }

    pub async fn refresh_admins(&self, bot: &Bot) -> anyhow::Result<Vec<UserId>> {
        let ids: Vec<UserId> = bot
            .get_chat_administrators(self.chat_id)
            .await?
            .iter()
            .map(|m| m.user.id)
            .collect();
        debug!(?ids, "Admins list fetched");
        *self.admins.lock().unwrap() = Some((ids.clone(), Instant::now()));
        Ok(ids)
    }

    /// Starts the warnings cooldown, false if it's still active.
    fn start_cooldown(&self) -> bool {
        let now = now_ms();
        let mut until = self.cooldown_until.lock().unwrap();
        if until.is_some_and(|until| until > now) {
            info!(cooldown_until = *until, "Still cooling down, no warning");
            return false;
        }
        let cooldown = self.settings().cooldown.as_millis() as u64;
        *until = (cooldown > 0).then_some(now + cooldown);
        true
    }

    /// Time left until warnings are issued again.
    pub fn remaining_cooldown(&self) -> Duration {
        let until = self.cooldown_until.lock().unwrap().unwrap_or(0);
        Duration::from_millis(until.saturating_sub(now_ms()))
    }

    /// Changes the cooldown value, adjusting the current cooldown to it.
    pub fn set_cooldown(&self, cooldown: Duration) -> anyhow::Result<()> {
        let old = self
            .store
            .update(|s| std::mem::replace(&mut s.settings.cooldown, cooldown))?;
        if let Some(until) = self.cooldown_until.lock().unwrap().as_mut() {
            *until = (*until + cooldown.as_millis() as u64).saturating_sub(old.as_millis() as u64);
        }
        Ok(())
    }

    /// Resets the cooldown value to the default one and ends the current cooldown.
    pub fn reset_cooldown(&self) -> anyhow::Result<Duration> {
        let default = Settings::default().cooldown;
        self.store.update(|s| s.settings.cooldown = default)?;
        *self.cooldown_until.lock().unwrap() = None;
        Ok(default)
    }
}

pub async fn on_message(bot: Bot, app: Arc<App>, msg: Message) -> anyhow::Result<()> {
    let (Some(text), Some(user)) = (msg.text(), msg.from.as_ref()) else {
        return Ok(());
    };
    let in_chat = msg.chat.id == app.chat_id;
    // Before commands, so unverified users can't post e.g. "/help <spam link>"
    if in_chat && captcha::on_message(&bot, &app, &msg, user).await? {
        return Ok(());
    }
    if let Some(command) = commands::parse(text, &app.bot_username) {
        return commands::handle(&bot, &app, &msg, user, command).await;
    }
    if !in_chat {
        return Ok(());
    }
    members::count_message(&app);

    if Utc::now() - msg.date > MESSAGE_AGE_THRESHOLD {
        info!(date = %msg.date, "Message is too old, not checking it");
        return Ok(());
    }
    if app.is_admin(&bot, user.id).await? {
        debug!("User is an admin, not checking the language");
        return Ok(());
    }
    let Some(violation) = check_message(&app.lid, &app.settings(), text, weekday_utc(now_ms()))
    else {
        return Ok(());
    };
    if !app.start_cooldown() {
        return Ok(());
    }
    violations::punish(&bot, &app, &msg, user, &violation).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::VERSION;
    use crate::langday::Lang;
    use crate::state::Captcha;
    use crate::testing::{ADMIN_ID, CHAT_ID, TestBot, USER_ID, message, message_at};

    const EN_TEXT: &str = "something in english here";

    /// Russian day regardless of the weekday the tests run on
    fn russian_day() -> Settings {
        Settings {
            forced_lang: Some(Lang::Ru),
            ..Settings::default()
        }
    }

    async fn send(t: &TestBot, msg: Message) {
        on_message(t.bot.clone(), t.app.clone(), msg).await.unwrap();
    }

    #[tokio::test]
    async fn warns_about_wrong_language() {
        let t = TestBot::new(russian_day()).await;
        send(&t, message(USER_ID, CHAT_ID, EN_TEXT)).await;
        let sent = t.calls("sendmessage").await;
        assert_eq!(sent.len(), 1);
        assert_eq!(
            sent[0]["text"],
            "Hey, today is a Russian day. Try to speak Russian!\n\nThis is your 1st warning."
        );
        assert_eq!(sent[0]["reply_parameters"]["message_id"], 1);
        assert_eq!(t.app.store.read(|s| s.violations[&USER_ID].count), 1);
    }

    #[tokio::test]
    async fn skips_admins_old_messages_other_chats_and_correct_language() {
        let t = TestBot::new(russian_day()).await;
        send(&t, message(ADMIN_ID, CHAT_ID, EN_TEXT)).await;
        let hour_ago = now_ms() / 1000 - 3600;
        send(&t, message_at(USER_ID, CHAT_ID, EN_TEXT, hour_ago)).await;
        send(&t, message(USER_ID, CHAT_ID - 1, EN_TEXT)).await;
        send(
            &t,
            message(USER_ID, CHAT_ID, "что-то на русском тут написано"),
        )
        .await;
        assert!(t.sent_texts().await.is_empty());
    }

    #[tokio::test]
    async fn warns_once_per_cooldown() {
        let t = TestBot::new(russian_day()).await;
        send(&t, message(USER_ID, CHAT_ID, EN_TEXT)).await;
        send(&t, message(USER_ID + 1, CHAT_ID, EN_TEXT)).await;
        assert_eq!(t.sent_texts().await.len(), 1);
        assert!(t.app.remaining_cooldown() > Duration::ZERO);
    }

    #[tokio::test]
    async fn mutes_after_too_many_warnings() {
        let t = TestBot::new(Settings {
            max_violations: 0,
            ..russian_day()
        })
        .await;
        send(&t, message(USER_ID, CHAT_ID, EN_TEXT)).await;
        let restrictions = t.calls("restrictchatmember").await;
        assert_eq!(restrictions.len(), 1);
        assert_eq!(restrictions[0]["user_id"], USER_ID);
        assert!(restrictions[0]["until_date"].as_i64().is_some());
        assert_eq!(
            t.sent_texts().await,
            ["You're temporarily muted for repeated violations."]
        );
    }

    #[tokio::test]
    async fn only_warns_with_mutes_disabled() {
        let t = TestBot::new(Settings {
            mute_enabled: false,
            max_violations: 0,
            ..russian_day()
        })
        .await;
        send(&t, message(USER_ID, CHAT_ID, EN_TEXT)).await;
        assert!(t.calls("restrictchatmember").await.is_empty());
        assert_eq!(
            t.sent_texts().await,
            ["Hey, today is a Russian day. Try to speak Russian!"]
        );
        assert!(
            t.app.store.read(|s| s.violations.is_empty()),
            "violations aren't counted"
        );
    }

    #[tokio::test]
    async fn runs_commands_with_admin_checks() {
        let t = TestBot::new(Settings::default()).await;
        send(&t, message(USER_ID, USER_ID as i64, "/version")).await;
        send(&t, message(USER_ID, CHAT_ID, "/settings")).await;
        send(&t, message(ADMIN_ID, ADMIN_ID as i64, "/settings")).await;
        let sent = t.sent_texts().await;
        assert_eq!(sent[0], VERSION);
        assert_eq!(
            sent[1],
            format!("@user{USER_ID} You're not allowed to do that!")
        );
        assert!(sent[2].contains("cooldown: 2m"), "{}", sent[2]);
    }

    #[tokio::test]
    async fn checks_captcha_before_language() {
        let t = TestBot::new(russian_day()).await;
        let captcha = Captcha {
            question: "2 + 3".into(),
            answer: "5".into(),
            username: None,
            asked_at: now_ms(),
            attempts: 0,
            msg_ids: vec![7],
        };
        t.app
            .store
            .update(|s| s.captchas.insert(USER_ID, captcha))
            .unwrap();

        send(&t, message(USER_ID, CHAT_ID, EN_TEXT)).await;
        assert_eq!(
            t.calls("deletemessage").await.len(),
            1,
            "unverified user's message is deleted"
        );
        assert!(t.sent_texts().await.is_empty(), "no language warning");

        send(&t, message(USER_ID, CHAT_ID, "5")).await;
        assert!(t.app.store.read(|s| s.captchas.is_empty()));
        assert_eq!(
            t.calls("deletemessages").await[0]["message_ids"],
            serde_json::json!([7])
        );
        assert!(t.sent_texts().await[0].starts_with("Welcome"));
    }

    #[tokio::test]
    async fn pardon_unmutes_text_mention_without_violations() {
        let t = TestBot::new(Settings::default()).await;
        let mut msg =
            serde_json::to_value(message(ADMIN_ID, ADMIN_ID as i64, "/pardon Name")).unwrap();
        msg["entities"] = serde_json::json!([{
            "type": "text_mention",
            "offset": 8,
            "length": 4,
            "user": crate::testing::user_json(USER_ID),
        }]);
        send(&t, serde_json::from_value(msg).unwrap()).await;

        let restrictions = t.calls("restrictchatmember").await;
        assert_eq!(restrictions.len(), 1, "unmuted although warnings expired");
        assert_eq!(restrictions[0]["user_id"], USER_ID);
        assert_eq!(t.sent_texts().await, ["Pardoned user @Name"]);
    }

    #[tokio::test]
    async fn unverified_users_cant_run_commands() {
        let t = TestBot::new(Settings::default()).await;
        let captcha = Captcha {
            question: "2 + 3".into(),
            answer: "5".into(),
            username: None,
            asked_at: now_ms(),
            attempts: 0,
            msg_ids: vec![],
        };
        t.app
            .store
            .update(|s| s.captchas.insert(USER_ID, captcha))
            .unwrap();

        send(&t, message(USER_ID, CHAT_ID, "/help https://spam.example")).await;
        assert_eq!(t.calls("deletemessage").await.len(), 1);
        assert!(t.sent_texts().await.is_empty());
    }
}
