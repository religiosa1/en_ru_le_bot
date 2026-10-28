//! Shared bot state and the pipeline for text messages.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::Utc;
use teloxide::prelude::*;
use tracing::{debug, info};

use crate::langday::{check_message, weekday_utc};
use crate::lid::Lid;
use crate::members::WelcomeState;
use crate::state::{Settings, Store, now_ms};
use crate::{captcha, commands, members, violations};

const ADMINS_CACHE_TTL: Duration = Duration::from_secs(3 * 60 * 60);

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
    pub cooldown_until: Mutex<Option<u64>>,
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

    /// Admins of the target chat, cached.
    pub async fn admin_ids(&self, bot: &Bot) -> anyhow::Result<Vec<UserId>> {
        if let Some((ids, refreshed_at)) = &*self.admins.lock().unwrap()
            && refreshed_at.elapsed() < ADMINS_CACHE_TTL
        {
            return Ok(ids.clone());
        }
        self.refresh_admins(bot).await
    }

    pub async fn refresh_admins(&self, bot: &Bot) -> anyhow::Result<Vec<UserId>> {
        let ids: Vec<UserId> = bot.get_chat_administrators(self.chat_id).await?.iter().map(|m| m.user.id).collect();
        debug!(?ids, "Admins list fetched");
        *self.admins.lock().unwrap() = Some((ids.clone(), Instant::now()));
        Ok(ids)
    }

    pub async fn is_admin(&self, bot: &Bot, user_id: UserId) -> anyhow::Result<bool> {
        Ok(self.admin_ids(bot).await?.contains(&user_id))
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
}

pub async fn on_message(bot: Bot, app: Arc<App>, msg: Message) -> anyhow::Result<()> {
    let (Some(text), Some(user)) = (msg.text(), msg.from.as_ref()) else {
        return Ok(());
    };
    if let Some(command) = commands::parse(text, &app.bot_username) {
        return commands::handle(&bot, &app, &msg, user, command).await;
    }
    if msg.chat.id != app.chat_id {
        return Ok(());
    }
    if captcha::on_message(&bot, &app, &msg, user).await? {
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
    let Some(violation) = check_message(&app.lid, &app.settings(), text, weekday_utc(now_ms())) else {
        return Ok(());
    };
    if !app.start_cooldown() {
        return Ok(());
    }
    violations::punish(&bot, &app, &msg, user, &violation).await
}
