//! Day change notifications at midnight (UTC).

use std::sync::Arc;
use std::time::Duration;

use teloxide::prelude::*;
use tracing::{error, info, warn};

use crate::bot::App;
use crate::duration::DAY;
use crate::langday::{Day, Lang, weekday_utc};
use crate::state::{Settings, now_ms};

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
    let Some(text) = announcement(&app.settings(), weekday) else {
        return;
    };
    info!(text, "Announcing day change");
    if let Err(err) = bot.send_message(app.chat_id, text).await {
        error!(%err, "Error while trying to issue day change warning");
    }
}

/// What to announce at the start of a day, None if nothing.
fn announcement(settings: &Settings, weekday: u32) -> Option<&'static str> {
    if !settings.alarm_enabled {
        return None;
    }
    match Day::of(settings, weekday) {
        // nothing changes on forced days
        Day::Disabled | Day::Forced(_) => None,
        Day::Scheduled(Some(Lang::En)) => Some("English day has begun."),
        Day::Scheduled(Some(Lang::Ru)) => Some("Начался русский день."),
        Day::Scheduled(None) => Some("Free day has begun.\nНачался свободный день."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TestBot;

    const SUNDAY: u32 = 0;
    const MONDAY: u32 = 1;
    const TUESDAY: u32 = 2;

    #[test]
    fn announces_scheduled_days() {
        let settings = Settings::default();
        assert_eq!(
            announcement(&settings, MONDAY),
            Some("Начался русский день.")
        );
        assert_eq!(
            announcement(&settings, TUESDAY),
            Some("English day has begun.")
        );
        assert_eq!(
            announcement(&settings, SUNDAY),
            Some("Free day has begun.\nНачался свободный день.")
        );
    }

    #[test]
    fn stays_silent_when_nothing_changes() {
        let forced = Settings {
            forced_lang: Some(Lang::En),
            ..Settings::default()
        };
        assert_eq!(announcement(&forced, MONDAY), None);
        let disabled = Settings {
            langday_checks: false,
            ..Settings::default()
        };
        assert_eq!(announcement(&disabled, MONDAY), None);
        let alarm_off = Settings {
            alarm_enabled: false,
            ..Settings::default()
        };
        assert_eq!(announcement(&alarm_off, MONDAY), None);
    }

    #[tokio::test]
    async fn sends_announcement_to_the_chat() {
        let t = TestBot::new(Settings::default()).await;
        announce(&t.bot, &t.app, TUESDAY).await;
        assert_eq!(t.sent_texts().await, ["English day has begun."]);

        let t = TestBot::new(Settings {
            alarm_enabled: false,
            ..Settings::default()
        })
        .await;
        announce(&t.bot, &t.app, TUESDAY).await;
        assert!(t.sent_texts().await.is_empty());
    }
}
