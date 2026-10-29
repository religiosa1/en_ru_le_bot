//! New members: probation, captcha and welcome messages.

use std::sync::Arc;

use chrono::{TimeDelta, Utc};
use teloxide::payloads::setters::*;
use teloxide::prelude::*;
use teloxide::types::{
    ChatMemberUpdated, ChatPermissions, MessageId, ParseMode, ReplyParameters, User,
};
use tracing::{debug, error, info};

use crate::bot::App;
use crate::state::lock;
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

pub async fn on_chat_member(
    bot: Bot,
    app: Arc<App>,
    update: ChatMemberUpdated,
) -> anyhow::Result<()> {
    if update.chat.id != app.chat_id {
        return Ok(());
    }
    let Some(user) = joined_user(&update) else {
        return Ok(());
    };
    info!(
        user_id = user.id.0,
        username = user.username,
        "New member joined"
    );
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
    info!(
        user_id = user.id.0,
        "Restricting user for probation, so they only can send text messages"
    );
    bot.restrict_chat_member(
        app.chat_id,
        user.id,
        ChatPermissions::SEND_MESSAGES | ChatPermissions::INVITE_USERS,
    )
    .until_date(Utc::now() + PROBATION_DURATION)
    .await?;
    Ok(())
}

/// Counts a chat message towards the next full welcome message.
pub fn count_message(app: &App) {
    let mut state = lock(&app.welcome);
    state.messages_to_long_welcome = state.messages_to_long_welcome.saturating_sub(1);
}

/// Welcomes a member who passed the captcha. Full welcome messages are sent only every few
/// chat messages; until then, newcomers are mentioned in a reply to the last one.
pub async fn welcome(bot: &Bot, app: &App, user: &User) {
    let (is_long, reply_to) = {
        let state = lock(&app.welcome);
        (state.messages_to_long_welcome == 0, state.last_long_welcome)
    };
    debug!(user_id = user.id.0, is_long, "Sending welcome");
    let mut request = bot
        .send_message(
            app.chat_id,
            if is_long {
                welcome_message(user)
            } else {
                md::mention(user)
            },
        )
        .parse_mode(ParseMode::MarkdownV2);
    if let Some(msg_id) = reply_to.filter(|_| !is_long) {
        request = request.reply_parameters(ReplyParameters::new(msg_id));
    }
    match request.await {
        Ok(msg) if is_long => {
            *lock(&app.welcome) = WelcomeState {
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

*DO NOT MESSAGE OTHER MEMBERS DIRECTLY UNTIL YOU AT LEAST KNOW THEM.*
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::state::Settings;
    use crate::testing::{CHAT_ID, SENT_MSG_ID, TestBot, USER_ID, member_update, user_json};

    #[test]
    fn detects_joins_only() {
        let joined = |old, new| joined_user(&member_update(user_json(USER_ID), old, new)).is_some();
        assert!(joined("left", "member"));
        assert!(joined("kicked", "member"));
        assert!(!joined("member", "left"), "leaving");
        assert!(!joined("member", "member"), "no change");
    }

    #[tokio::test]
    async fn newcomer_gets_probation_and_captcha() {
        let t = TestBot::new(Settings::default()).await;
        on_chat_member(
            t.bot.clone(),
            t.app.clone(),
            member_update(user_json(USER_ID), "left", "member"),
        )
        .await
        .unwrap();

        let restrictions = t.calls("restrictchatmember").await;
        assert_eq!(restrictions.len(), 1);
        assert_eq!(restrictions[0]["user_id"], USER_ID);
        assert_eq!(restrictions[0]["permissions"]["can_send_messages"], true);
        // false permissions are omitted in the request
        assert_ne!(restrictions[0]["permissions"]["can_send_photos"], true);

        let sent = t.calls("sendmessage").await;
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0]["parse_mode"], "MarkdownV2");
        assert!(
            sent[0]["text"]
                .as_str()
                .unwrap()
                .contains("please send the answer")
        );
        assert_eq!(
            t.app.store.read(|s| s.captchas[&USER_ID].msg_ids.clone()),
            [SENT_MSG_ID]
        );
    }

    #[tokio::test]
    async fn ignores_other_member_changes_and_chats() {
        let t = TestBot::new(Settings::default()).await;
        on_chat_member(
            t.bot.clone(),
            t.app.clone(),
            member_update(user_json(USER_ID), "member", "left"),
        )
        .await
        .unwrap();
        let mut other_chat = member_update(user_json(USER_ID), "left", "member");
        other_chat.chat.id = ChatId(CHAT_ID - 1);
        on_chat_member(t.bot.clone(), t.app.clone(), other_chat)
            .await
            .unwrap();
        assert!(t.calls("restrictchatmember").await.is_empty());
        assert!(t.sent_texts().await.is_empty());
    }

    #[tokio::test]
    async fn bots_are_banned_unless_allowed() {
        let bot_user =
            json!({"id": 7, "is_bot": true, "first_name": "Spam", "username": "spam_bot"});
        let t = TestBot::new(Settings::default()).await;
        on_chat_member(
            t.bot.clone(),
            t.app.clone(),
            member_update(bot_user.clone(), "left", "member"),
        )
        .await
        .unwrap();
        assert_eq!(t.calls("banchatmember").await.len(), 1);
        assert!(
            t.calls("restrictchatmember").await.is_empty(),
            "no probation for bots"
        );

        let t = TestBot::new(Settings {
            captcha_bots_allowed: true,
            ..Settings::default()
        })
        .await;
        on_chat_member(
            t.bot.clone(),
            t.app.clone(),
            member_update(bot_user, "left", "member"),
        )
        .await
        .unwrap();
        assert!(t.calls("banchatmember").await.is_empty());
    }

    #[tokio::test]
    async fn no_captcha_when_disabled() {
        let t = TestBot::new(Settings {
            captcha_enabled: false,
            ..Settings::default()
        })
        .await;
        on_chat_member(
            t.bot.clone(),
            t.app.clone(),
            member_update(user_json(USER_ID), "left", "member"),
        )
        .await
        .unwrap();
        assert_eq!(
            t.calls("restrictchatmember").await.len(),
            1,
            "probation still applies"
        );
        assert!(t.sent_texts().await.is_empty());
    }

    #[tokio::test]
    async fn rotates_long_and_short_welcomes() {
        let t = TestBot::new(Settings::default()).await;
        let user: User = serde_json::from_value(user_json(USER_ID)).unwrap();
        welcome(&t.bot, &t.app, &user).await;
        welcome(&t.bot, &t.app, &user).await;
        for _ in 0..MESSAGES_BETWEEN_LONG_WELCOMES {
            count_message(&t.app);
        }
        welcome(&t.bot, &t.app, &user).await;

        let sent = t.calls("sendmessage").await;
        assert!(sent[0]["text"].as_str().unwrap().starts_with("Welcome"));
        assert!(sent[0].get("reply_parameters").is_none());
        assert_eq!(
            sent[1]["text"],
            md::mention(&user),
            "short one is a mention"
        );
        assert_eq!(sent[1]["reply_parameters"]["message_id"], SENT_MSG_ID);
        assert!(
            sent[2]["text"].as_str().unwrap().starts_with("Welcome"),
            "long again after enough messages"
        );
    }
}
