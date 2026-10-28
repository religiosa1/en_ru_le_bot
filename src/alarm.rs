//! Day change notifications at midnight (UTC).

use std::sync::Arc;
use std::time::Duration;

use teloxide::prelude::*;
use tracing::{error, info, warn};

use crate::bot::App;
use crate::duration::DAY;
use crate::langday::{Day, Lang, weekday_utc};
use crate::state::now_ms;

/// Announcements this late (e.g. after the host was suspended) are skipped
const MAX_DELAY_MS: u64 = 60 * 60 * 1000;

/// Announces each day's language at midnight, runs forever.
pub async fn run(bot: Bot, app: Arc<App>) {
    // Advanced by a day each time, rather than recomputed from the clock, so a clock
    // adjustment around midnight can't make it announce the same day twice
    let mut midnight = (now_ms() / DAY + 1) * DAY;
    loop {
        tokio::time::sleep(Duration::from_millis(midnight.saturating_sub(now_ms()))).await;
        if now_ms() > midnight + MAX_DELAY_MS {
            warn!(midnight, "Day change announcement is too late, skipping");
        } else {
            announce(&bot, &app, weekday_utc(midnight)).await;
        }
        midnight += DAY;
    }
}

async fn announce(bot: &Bot, app: &App, weekday: u32) {
    let settings = app.settings();
    if !settings.alarm_enabled {
        return;
    }
    let text = match Day::of(&settings, weekday) {
        // nothing changes on forced days
        Day::Disabled | Day::Forced(_) => return,
        Day::Scheduled(Some(Lang::En)) => "English Day has begun.",
        Day::Scheduled(Some(Lang::Ru)) => "Начался русский день.",
        Day::Scheduled(None) => "Free Day has begun.\nНачался свободный день.",
    };
    info!(text, "Announcing day change");
    if let Err(err) = bot.send_message(app.chat_id, text).await {
        error!(%err, "Error while trying to issue day change warning");
    }
}
