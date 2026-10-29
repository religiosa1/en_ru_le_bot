//! Test helpers: a fake Telegram Bot API recording the calls handlers make, and update builders.

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::{Value, json};
use teloxide::prelude::*;
use teloxide::types::ChatMemberUpdated;
use wiremock::matchers::any;
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

use crate::bot::App;
use crate::lid::Lid;
use crate::state::{Settings, Store, now_ms};

pub const CHAT_ID: i64 = -100_123;
pub const ADMIN_ID: u64 = 1;
pub const USER_ID: u64 = 42;
/// Id of every message the bot sends
pub const SENT_MSG_ID: i32 = 1000;

/// Answers Bot API calls with minimal valid results.
struct FakeTelegram;

impl Respond for FakeTelegram {
    fn respond(&self, request: &Request) -> ResponseTemplate {
        let result = match method_name(request).as_str() {
            "sendmessage" => {
                json!({"message_id": SENT_MSG_ID, "date": 0, "chat": chat_json(CHAT_ID), "text": "sent"})
            }
            "getchatadministrators" => {
                json!([{"status": "creator", "is_anonymous": false, "user": user_json(ADMIN_ID)}])
            }
            _ => json!(true),
        };
        ResponseTemplate::new(200).set_body_json(json!({"ok": true, "result": result}))
    }
}

fn method_name(request: &Request) -> String {
    request
        .url
        .path_segments()
        .and_then(|mut s| s.next_back())
        .unwrap_or_default()
        .to_lowercase()
}

/// Bot and app talking to a fake Bot API, with state in a temp file.
pub struct TestBot {
    pub bot: Bot,
    pub app: Arc<App>,
    server: MockServer,
}

impl TestBot {
    pub async fn new(settings: Settings) -> Self {
        let server = MockServer::start().await;
        Mock::given(any())
            .respond_with(FakeTelegram)
            .mount(&server)
            .await;
        let bot = Bot::new("123:test").set_api_url(server.uri().parse().unwrap());
        let store = Store::load(temp_state_path()).unwrap();
        store.update(|s| s.settings = settings).unwrap();
        let app = Arc::new(App::new(
            store,
            Lid::embedded().unwrap(),
            ChatId(CHAT_ID),
            "en_ru_le_bot".into(),
        ));
        Self { bot, app, server }
    }

    /// Params of the calls made to a Bot API method, e.g. "sendmessage".
    pub async fn calls(&self, method: &str) -> Vec<Value> {
        let requests = self.server.received_requests().await.unwrap_or_default();
        requests
            .iter()
            .filter(|r| method_name(r) == method)
            .map(|r| serde_json::from_slice(&r.body).unwrap_or(Value::Null))
            .collect()
    }

    /// Texts of the messages sent so far.
    pub async fn sent_texts(&self) -> Vec<String> {
        self.calls("sendmessage")
            .await
            .iter()
            .map(|c| c["text"].as_str().unwrap_or_default().to_owned())
            .collect()
    }
}

fn temp_state_path() -> String {
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir =
        std::env::temp_dir().join(format!("en_ru_le_bot_handlers_{}_{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir.join("state.json").to_string_lossy().into_owned()
}

pub fn user_json(id: u64) -> Value {
    json!({"id": id, "is_bot": false, "first_name": "Name", "username": format!("user{id}")})
}

fn chat_json(id: i64) -> Value {
    if id < 0 {
        json!({"id": id, "type": "supergroup", "title": "Chat"})
    } else {
        json!({"id": id, "type": "private", "first_name": "Name"})
    }
}

fn now_secs() -> u64 {
    now_ms() / 1000
}

/// A text message sent just now.
pub fn message(from: u64, chat_id: i64, text: &str) -> Message {
    message_at(from, chat_id, text, now_secs())
}

/// A text message sent at a unix time (seconds).
pub fn message_at(from: u64, chat_id: i64, text: &str, date: u64) -> Message {
    serde_json::from_value(json!({
        "message_id": 1,
        "date": date,
        "chat": chat_json(chat_id),
        "from": user_json(from),
        "text": text,
    }))
    .unwrap()
}

/// A chat member status change in the target chat, between "left", "kicked" and "member".
pub fn member_update(user: Value, old_status: &str, new_status: &str) -> ChatMemberUpdated {
    serde_json::from_value(json!({
        "chat": chat_json(CHAT_ID),
        "from": user,
        "date": now_secs(),
        "old_chat_member": {"status": old_status, "user": user, "until_date": 0},
        "new_chat_member": {"status": new_status, "user": user, "until_date": 0},
    }))
    .unwrap()
}
