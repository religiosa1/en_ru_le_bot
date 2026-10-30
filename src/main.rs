use std::env;
use std::io::{IsTerminal, stdout};
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, bail};
use teloxide::error_handlers::IgnoringErrorHandler;
use teloxide::payloads::setters::*;
use teloxide::prelude::*;
use teloxide::types::{AllowedUpdate, BotCommandScope, Recipient};
use teloxide::update_listeners::Polling;
use tracing::{error, info};

use en_ru_le_bot::bot::{self, App};
use en_ru_le_bot::lid::Lid;
use en_ru_le_bot::state::Store;
use en_ru_le_bot::{VERSION, alarm, captcha, commands, members};

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
            chat_id: ChatId(
                chat_id
                    .parse()
                    .with_context(|| format!("CHAT_ID {chat_id:?} isn't a valid chat id"))?,
            ),
            state_path: state_path(),
        })
    }
}

/// STATE_PATH, or state.json in the systemd StateDirectory=, or in ./data.
fn state_path() -> String {
    env::var("STATE_PATH")
        .or_else(|_| env::var("STATE_DIRECTORY").map(|dir| format!("{dir}/state.json")))
        .unwrap_or_else(|_| "data/state.json".into())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if env::args()
        .skip(1)
        .any(|arg| arg == "--version" || arg == "-V")
    {
        println!("en_ru_le_bot {VERSION}");
        return Ok(());
    }

    let logs = tracing_subscriber::fmt()
        .with_env_filter(env::var("LOG_LEVEL").unwrap_or_else(|_| "info".into()));
    match env::var("LOG_FORMAT").as_deref() {
        Err(_) | Ok("text") => logs.with_ansi(stdout().is_terminal()).init(),
        Ok("json") => logs.json().with_span_list(false).init(),
        Ok(other) => bail!("LOG_FORMAT {other:?} must be either text or json"),
    }

    info!(version = VERSION, "Starting");
    let config = Config::from_env()?;
    let store = Store::load(&config.state_path)?;

    let started = Instant::now();
    let lid = Lid::embedded()?;
    info!(
        duration_ms = started.elapsed().as_millis() as u64,
        "Language model loaded"
    );

    let bot = Bot::new(config.token);
    let me = bot.get_me().await.context("get bot info")?;
    info!(username = me.username(), "Bot info loaded");
    let app = Arc::new(App::new(store, lid, config.chat_id, me.username().into()));

    set_menus(&bot, config.chat_id).await;
    tokio::spawn(captcha::sweep(bot.clone(), app.clone()));
    tokio::spawn(alarm::run(bot.clone(), app.clone()));

    let listener = Polling::builder(bot.clone())
        .allowed_updates(vec![AllowedUpdate::Message, AllowedUpdate::ChatMember])
        // A webhook left on the token would make Telegram refuse polling
        .delete_webhook()
        .await
        .build();
    let handler = dptree::entry()
        .branch(Update::filter_message().endpoint(bot::on_message))
        .branch(Update::filter_chat_member().endpoint(members::on_chat_member));
    Dispatcher::builder(bot, handler)
        .dependencies(dptree::deps![app])
        // Handlers log errors inside the update's span, the default handler would log them twice
        .error_handler(IgnoringErrorHandler::new())
        .enable_ctrlc_handler()
        .build()
        .dispatch_with_listener(
            listener,
            LoggingErrorHandler::with_custom_text("Polling error"),
        )
        .await;
    Ok(())
}

/// Command menus in the target chat, admins get admin commands as well.
async fn set_menus(bot: &Bot, chat_id: ChatId) {
    let chat_id = Recipient::Id(chat_id);
    let menus = [
        (
            commands::menu(false),
            BotCommandScope::Chat {
                chat_id: chat_id.clone(),
            },
        ),
        (
            commands::menu(true),
            BotCommandScope::ChatAdministrators { chat_id },
        ),
    ];
    for (menu, scope) in menus {
        // Not fatal, the commands work without the menu
        if let Err(err) = bot.set_my_commands(menu).scope(scope).await {
            error!(%err, "Failed to set command menu");
        }
    }
}
