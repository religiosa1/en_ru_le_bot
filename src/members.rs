//! New members: probation, captcha and welcome messages.

use std::sync::Arc;

use chrono::{TimeDelta, Utc};
use teloxide::payloads::setters::*;
use teloxide::prelude::*;
use teloxide::types::{ChatMemberUpdated, ChatPermissions, MessageId, ParseMode, ReplyParameters, User};
use tracing::{debug, error, info};

use crate::bot::App;
use crate::{captcha, md};

/// Newcomers can only send text messages for this long, to prevent spam.
const PROBATION_DURATION: TimeDelta = TimeDelta::days(1);
/// Chat messages between full welcome messages; before that newcomers just get mentioned under the last one.
const MESSAGES_BETWEEN_LONG_WELCOMES: u32 = 10;

/// In memory, as it's not crucial.
#[derive(Default)]
pub struct WelcomeState {
    messages_to_long_welcome: u32,
    last_long_welcome: Option<MessageId>,
}

pub async fn on_chat_member(bot: Bot, app: Arc<App>, update: ChatMemberUpdated) -> anyhow::Result<()> {
    if update.chat.id != app.chat_id {
        return Ok(());
    }
    let Some(user) = joined_user(&update) else {
        return Ok(());
    };
    info!(user_id = user.id.0, username = user.username, "New member joined");
    if !user.is_bot
        && let Err(err) = probation(&bot, &app, user).await
    {
        error!(%err, user_id = user.id.0, "Error restricting user for probation period");
    }
    captcha::on_join(&bot, &app, user).await
}

/// User who just joined the chat, as opposed to other member status changes.
fn joined_user(update: &ChatMemberUpdated) -> Option<&User> {
    let old = &update.old_chat_member.kind;
    (update.new_chat_member.kind.is_member() && (old.is_left() || old.is_banned()))
        .then_some(&update.new_chat_member.user)
}

async fn probation(bot: &Bot, app: &App, user: &User) -> anyhow::Result<()> {
    info!(user_id = user.id.0, "Restricting user for probation, so they only can send text messages");
    bot.restrict_chat_member(app.chat_id, user.id, ChatPermissions::SEND_MESSAGES | ChatPermissions::INVITE_USERS)
        .until_date(Utc::now() + PROBATION_DURATION)
        .await?;
    Ok(())
}

/// Counts a chat message towards the next full welcome message.
pub fn count_message(app: &App) {
    let mut state = app.welcome.lock().unwrap();
    state.messages_to_long_welcome = state.messages_to_long_welcome.saturating_sub(1);
}

/// Welcomes a member who passed the captcha. Full welcome messages are sent only every few
/// chat messages; until then, newcomers are mentioned in a reply to the last one.
pub async fn welcome(bot: &Bot, app: &App, user: &User) {
    let (is_long, reply_to) = {
        let state = app.welcome.lock().unwrap();
        (state.messages_to_long_welcome == 0, state.last_long_welcome)
    };
    debug!(user_id = user.id.0, is_long, "Sending welcome");
    let mut request = bot
        .send_message(app.chat_id, if is_long { welcome_message(user) } else { md::mention(user) })
        .parse_mode(ParseMode::MarkdownV2);
    if let (false, Some(msg_id)) = (is_long, reply_to) {
        request = request.reply_parameters(ReplyParameters::new(msg_id));
    }
    match request.await {
        Ok(msg) if is_long => {
            *app.welcome.lock().unwrap() = WelcomeState {
                messages_to_long_welcome: MESSAGES_BETWEEN_LONG_WELCOMES,
                last_long_welcome: Some(msg.id),
            };
        }
        Ok(_) => {}
        Err(err) => error!(%err, "Error while sending a welcome message"),
    }
}

pub fn welcome_message(user: &User) -> String {
    let mention = md::mention(user);
    md::fill(
        "Welcome, {}!
This chat is for practicing English and Russian.

Monday, Wednesday and Friday — Russian days.
Tuesday, Thursday and Saturday — English days.
Sunday — free day.

To prevent spam, newcomers can't post GIFs and such for a while after they join.

*DO NOT WRITE TO OTHER MEMBERS DIRECTLY UNTIL YOU AT LEAST KNOW THEM.*
Write to the admins if someone is bothering you, so they can settle the situation.

Добро пожаловать, {}!
Этот чат предназначен для практики английского и русского языков.

Понедельник, среда и пятница — русские дни.
Вторник, четверг и суббота — английские.
Воскресенье — свободный день.

В целях предотвращения спама новым участникам какое-то время после вступления нельзя отправлять гифки и т. п.

*НЕ ПИШИТЕ ДРУГИМ УЧАСТНИКАМ В ЛИЧКУ, ПОКА ВЫ С НИМИ ХОТЯ БЫ НЕ ПОЗНАКОМИТЕСЬ.*
Если вам кто-то докучает, пишите админам, чтобы они могли урегулировать ситуацию.",
        &[&mention, &mention],
    )
}
