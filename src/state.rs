//! Bot state persisted as a single JSON file.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Context;
use serde::{Deserialize, Serialize};

use crate::duration::{self, DAY};
use crate::langday::Lang;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub langday_checks: bool,
    pub otherlang_checks: bool,
    pub forced_lang: Option<Lang>,
    pub mute_enabled: bool,
    #[serde(with = "duration::as_str")]
    pub mute_duration: Duration,
    /// Warnings a user gets before a mute.
    pub max_violations: u32,
    #[serde(with = "duration::as_str")]
    pub warnings_expiry: Duration,
    #[serde(with = "duration::as_str")]
    pub cooldown: Duration,
    pub captcha_enabled: bool,
    #[serde(with = "duration::as_str")]
    pub captcha_max_age: Duration,
    pub captcha_bots_allowed: bool,
    pub alarm_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            langday_checks: true,
            otherlang_checks: true,
            forced_lang: None,
            mute_enabled: true,
            mute_duration: Duration::from_secs(15 * 60),
            max_violations: 2,
            warnings_expiry: Duration::from_secs(3 * 60 * 60),
            cooldown: Duration::from_secs(2 * 60),
            captcha_enabled: true,
            captcha_max_age: Duration::from_secs(20 * 60),
            captcha_bots_allowed: false,
            alarm_enabled: true,
        }
    }
}

/// Pending verification of a newly joined member.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Captcha {
    pub question: String,
    pub answer: String,
    pub username: Option<String>,
    /// Unix ms
    pub asked_at: u64,
    pub attempts: u32,
    /// Bot messages to clean up after verification.
    pub msg_ids: Vec<i32>,
}

/// Pending captchas are dropped after this, long after the sweep bans those who didn't solve them.
const CAPTCHA_TTL_MS: u64 = DAY;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Violation {
    pub count: u32,
    pub username: Option<String>,
    /// Unix ms
    pub expires_at: u64,
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct State {
    pub settings: Settings,
    /// By user id
    pub captchas: HashMap<u64, Captcha>,
    /// By user id
    pub violations: HashMap<u64, Violation>,
}

/// A user referenced in an admin command: by id (text mention) or by @username.
#[derive(Debug, Clone, PartialEq)]
pub enum UserRef {
    Id(u64),
    Username(String),
}

impl UserRef {
    /// Finds a user id in a map of records with usernames.
    pub fn find<T>(&self, records: &HashMap<u64, T>, username: impl Fn(&T) -> Option<&str>) -> Option<u64> {
        match self {
            UserRef::Id(id) => records.contains_key(id).then_some(*id),
            UserRef::Username(name) => records.iter().find(|(_, r)| username(r) == Some(name.as_str())).map(|(id, _)| *id),
        }
    }
}

impl State {
    fn prune(&mut self, now: u64) {
        self.captchas.retain(|_, c| c.asked_at + CAPTCHA_TTL_MS > now);
        self.violations.retain(|_, v| v.expires_at > now);
    }
}

pub struct Store {
    state: Mutex<State>,
    path: PathBuf,
}

impl Store {
    /// Loads the state file, starting with defaults if it doesn't exist yet.
    ///
    /// A corrupted file is an error, so we never silently overwrite it with defaults.
    pub fn load(path: impl Into<PathBuf>) -> anyhow::Result<Self> {
        let path = path.into();
        let state = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).with_context(|| format!("parse state file {path:?}"))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => State::default(),
            Err(e) => return Err(e).with_context(|| format!("read state file {path:?}")),
        };
        Ok(Self { state: Mutex::new(state), path })
    }

    /// Reads current state, with expired records already removed.
    pub fn read<T>(&self, f: impl FnOnce(&State) -> T) -> T {
        let mut state = self.state.lock().unwrap();
        state.prune(now_ms());
        f(&state)
    }

    /// Mutates the state and persists it.
    // ponytail: rewrites the whole file synchronously under the lock, fine for a few KB of state.
    pub fn update<T>(&self, f: impl FnOnce(&mut State) -> T) -> anyhow::Result<T> {
        let mut state = self.state.lock().unwrap();
        state.prune(now_ms());
        let result = f(&mut state);
        self.save(&state)?;
        Ok(result)
    }

    fn save(&self, state: &State) -> anyhow::Result<()> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).with_context(|| format!("create state dir {dir:?}"))?;
        }
        // Write + rename, so a crash mid-write never leaves a truncated file
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(state)?).with_context(|| format!("write {tmp:?}"))?;
        fs::rename(&tmp, &self.path).with_context(|| format!("rename {tmp:?} to {:?}", self.path))?;
        Ok(())
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("en_ru_le_bot_test_{}_{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join("state.json")
    }

    fn violation(expires_at: u64) -> Violation {
        Violation { count: 1, username: Some("user".into()), expires_at }
    }

    #[test]
    fn missing_file_gives_defaults() {
        let store = Store::load(temp_path("missing")).unwrap();
        assert_eq!(store.read(|s| s.clone()), State::default());
    }

    #[test]
    fn survives_restart() {
        let path = temp_path("restart");
        let store = Store::load(&path).unwrap();
        store
            .update(|s| {
                s.settings.forced_lang = Some(Lang::Ru);
                s.settings.mute_duration = Duration::from_millis(3_723_004); // 1h2m3s4ms, lossless
                s.violations.insert(42, violation(now_ms() + 60_000));
            })
            .unwrap();
        let before = store.read(|s| s.clone());

        assert_eq!(Store::load(&path).unwrap().read(|s| s.clone()), before);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn expired_records_are_dropped() {
        let store = Store::load(temp_path("expiry")).unwrap();
        let now = now_ms();
        store
            .update(|s| {
                s.violations.insert(1, violation(now - 1));
                s.violations.insert(2, violation(now + 60_000));
            })
            .unwrap();
        assert_eq!(store.read(|s| s.violations.keys().copied().collect::<Vec<_>>()), [2]);
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let path = temp_path("partial");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, r#"{"settings": {"cooldown": "5m", "captcha_enabled": false}}"#).unwrap();

        let settings = Store::load(&path).unwrap().read(|s| s.settings.clone());
        assert_eq!(
            settings,
            Settings { cooldown: Duration::from_secs(300), captcha_enabled: false, ..Settings::default() }
        );
    }

    #[test]
    fn corrupted_file_is_an_error() {
        let path = temp_path("corrupted");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "{nope").unwrap();
        assert!(Store::load(&path).is_err());
    }
}
