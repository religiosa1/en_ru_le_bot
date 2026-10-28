use std::env;
use std::sync::Arc;
use std::time::Instant;

use anyhow::Context;
use teloxide::prelude::*;
use teloxide::types::AllowedUpdate;
use teloxide::update_listeners::Polling;
use tracing::{error, info};

use en_ru_le_bot::lid::Lid;
use en_ru_le_bot::state::Store;

struct Config {
    token: String,
    chat_id: ChatId,
    state_path: String,
}

impl Config {
    fn from_env() -> anyhow::Result<Self> {
        let chat_id = env::var("CHAT_ID").context("CHAT_ID env variable is required")?;
        Ok(Self {
            token: env::var("TOKEN").context("TOKEN env variable is required")?,
            chat_id: ChatId(chat_id.parse().with_context(|| format!("CHAT_ID {chat_id:?} isn't a valid chat id"))?),
            state_path: env::var("STATE_PATH").unwrap_or_else(|_| "data/state.json".into()),
        })
    }
}

#[allow(dead_code)] // fields are used by slices ported in the next steps
struct App {
    store: Store,
    lid: Lid,
    chat_id: ChatId,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(env::var("LOG_LEVEL").unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::from_env()?;
    let store = Store::load(&config.state_path)?;

    let started = Instant::now();
    let lid = Lid::load();
    info!(duration_ms = started.elapsed().as_millis() as u64, "Language models loaded");

    let app = Arc::new(App { store, lid, chat_id: config.chat_id });
    let bot = Bot::new(config.token);
    let listener = Polling::builder(bot.clone())
        .allowed_updates(vec![AllowedUpdate::Message, AllowedUpdate::ChatMember, AllowedUpdate::MyChatMember])
        .build();

    let handler = Update::filter_message().endpoint(on_message);
    Dispatcher::builder(bot, handler)
        .dependencies(dptree::deps![app])
        .error_handler(Arc::new(|err: anyhow::Error| async move { error!(err = format!("{err:#}"), "Update handling failed") }))
        .enable_ctrlc_handler()
        .build()
        .dispatch_with_listener(listener, LoggingErrorHandler::with_custom_text("Polling error"))
        .await;
    Ok(())
}

async fn on_message(app: Arc<App>, msg: Message) -> anyhow::Result<()> {
    if msg.chat.id != app.chat_id {
        return Ok(());
    }
    info!(text = msg.text(), "Message received");
    Ok(())
}
