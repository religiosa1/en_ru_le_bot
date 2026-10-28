//! Day change notifications at midnight (UTC).

use std::sync::Arc;
use std::time::Duration;

use teloxide::prelude::*;
use tracing::{error, info};

use crate::bot::App;
use crate::duration::DAY;
use crate::langday::{Day, Lang, weekday_utc};
use crate::state::now_ms;

/// The day is determined a bit ahead, in case the timer fires slightly early
const LOOKAHEAD_MS: u64 = 30 * 60 * 1000;

/// Announces each day's language at midnight, runs forever.
pub async fn run(bot: Bot, app: Arc<App>) {
    loop {
        let now = now_ms();
        let next_midnight = (now / DAY + 1) * DAY;
        tokio::time::sleep(Duration::from_millis(next_midnight - now)).await;

        let settings = app.settings();
        if !settings.alarm_enabled {
            continue;
        }
        let text = match Day::of(&settings, weekday_utc(now_ms() + LOOKAHEAD_MS)) {
            // nothing changes on forced days
            Day::Disabled | Day::Forced(_) => continue,
            Day::Scheduled(Some(Lang::En)) => "English Day has begun.",
            Day::Scheduled(Some(Lang::Ru)) => "Начался русский день.",
            Day::Scheduled(None) => "Free Day has begun.\nНачался свободный день.",
        };
        info!(text, "Announcing day change");
        if let Err(err) = bot.send_message(app.chat_id, text).await {
            error!(%err, "Error while trying to issue day change warning");
        }
    }
}
