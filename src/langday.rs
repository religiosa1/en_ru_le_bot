//! Day language schedule and message language detection.

use std::collections::HashSet;
use std::sync::LazyLock;

use chrono::{DateTime, Datelike};
use regex::Regex;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

use crate::lid::{Label, Lid, URL_OR_MENTION_RE};
use crate::state::Settings;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    En,
    Ru,
}

impl Lang {
    pub fn code(self) -> &'static str {
        match self {
            Lang::En => "en",
            Lang::Ru => "ru",
        }
    }
}

/// Language of the day by weekday (0 = Sunday), None is a free day.
pub fn scheduled_lang(weekday: u32) -> Option<Lang> {
    match weekday {
        0 => None,
        1 | 3 | 5 => Some(Lang::Ru),
        2 | 4 | 6 => Some(Lang::En),
        _ => panic!("{weekday} is not a valid weekday, must be in 0..=6"),
    }
}

/// Language rules of a day.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Day {
    /// En/ru days are switched off by admins
    Disabled,
    Forced(Lang),
    /// By the weekly schedule, None is a free day
    Scheduled(Option<Lang>),
}

impl Day {
    pub fn of(settings: &Settings, weekday: u32) -> Self {
        match (settings.langday_checks, settings.forced_lang) {
            (false, _) => Day::Disabled,
            (true, Some(lang)) => Day::Forced(lang),
            (true, None) => Day::Scheduled(scheduled_lang(weekday)),
        }
    }

    /// Language required on this day, if any.
    pub fn lang(self) -> Option<Lang> {
        match self {
            Day::Disabled | Day::Scheduled(None) => None,
            Day::Forced(lang) | Day::Scheduled(Some(lang)) => Some(lang),
        }
    }
}

/// UTC weekday of a unix ms timestamp, 0 = Sunday.
pub fn weekday_utc(unix_ms: u64) -> u32 {
    DateTime::from_timestamp_millis(unix_ms as i64)
        .expect("timestamp in range")
        .weekday()
        .num_days_from_sunday()
}

/// Latin or cyrillic "ha-ha"s
static LAUGH_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b(?:[hх][aeае][hх]?-?)+\b").unwrap());
static NON_LETTER_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[^\p{L}\s]").unwrap());

/// Strips urls, mentions, ha-ha-s and everything except letters, collapsing whitespace.
pub fn strip_non_letter_or_whitespace_chars(text: &str) -> String {
    let text = URL_OR_MENTION_RE.replace_all(text, " ");
    let text = LAUGH_RE.replace_all(&text, "");
    NON_LETTER_RE
        .replace_all(&text, "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

static CYRILLIC_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\p{Cyrillic}").unwrap());
static LATIN_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\p{Latin}").unwrap());

/// If both languages are present, one must dominate by this rate to count as the message language.
const REQUIRED_LANGUAGE_RATE: f64 = 1.7;

/// Main language of a message by letter counts, None if it's mixed or has no letters.
pub fn detect_en_ru(text: &str) -> Option<Lang> {
    let ru = CYRILLIC_RE.find_iter(text).count() as f64;
    let en = LATIN_RE.find_iter(text).count() as f64;
    match (ru, en) {
        (0.0, 0.0) => None,
        (0.0, _) => Some(Lang::En),
        (_, 0.0) => Some(Lang::Ru),
        _ if ru / en < 1.0 / REQUIRED_LANGUAGE_RATE => Some(Lang::En),
        _ if ru / en > REQUIRED_LANGUAGE_RATE => Some(Lang::Ru),
        _ => None,
    }
}

/// Common kaomoji chars, which are letters technically, but we ignore them.
const KAOMOJI_CHARS: &str = "ツシシノººノㅇㅅㅇㅠㅠㅜㅜωツʘʘ";

/// Share of letters in the charset, None if there are no letters.
fn charset_rate(text: &str, in_charset: impl Fn(char) -> bool) -> Option<f64> {
    let letters: Vec<char> = text
        .chars()
        .filter(|c| c.is_alphabetic() && !KAOMOJI_CHARS.contains(*c))
        .collect();
    if letters.is_empty() {
        return None;
    }
    Some(letters.iter().filter(|c| in_charset(**c)).count() as f64 / letters.len() as f64)
}

const CHARSET_MATCH_RATE: f64 = 0.95;

fn is_cyrillic(c: char) -> bool {
    CYRILLIC_RE.is_match(c.encode_utf8(&mut [0; 4]))
}

/// Detects languages with a script other than cyrillic or latin, e.g. arabic or chinese.
pub fn detect_bad_lang_by_charset(text: &str) -> bool {
    let allowed = |c: char| c.is_ascii_alphabetic() || "ïëöÏËÖ".contains(c) || is_cyrillic(c);
    charset_rate(text, allowed).is_some_and(|rate| rate < CHARSET_MATCH_RATE)
}

/// True for mostly cyrillic texts, and for texts without letters.
pub fn is_mostly_cyrillic(text: &str) -> bool {
    charset_rate(text, is_cyrillic).is_none_or(|rate| rate >= CHARSET_MATCH_RATE)
}

static EN_WORDS: LazyLock<HashSet<&str>> =
    LazyLock::new(|| include_str!("../words/en.txt").lines().collect());
static RU_WORDS: LazyLock<HashSet<&str>> =
    LazyLock::new(|| include_str!("../words/ru.txt").lines().collect());

const ML_MIN_LENGTH: usize = 10;
/// Longer messages are checked even if every word is capitalized, so the rule can't be abused.
const MAX_NAME_LIST_WORDS: usize = 5;
const ML_TARGET_CONFIDENCE: f32 = 0.7;
/// Share of words outside the common en/ru vocab, required to confirm an ML detection.
const UNKNOWN_WORDS_THRESHOLD: f64 = 0.6;

/// Messages shorter than this (in letters) aren't checked at all.
pub const MIN_MSG_LENGTH: usize = 5;

/// Message written in a wrong language.
#[derive(Debug, Clone, PartialEq)]
pub struct LangViolation {
    /// Language of the day, None on free days (or with en/ru days disabled)
    pub day: Option<Lang>,
    /// Language of the message, None for languages other than en/ru
    pub msg: Option<Lang>,
}

/// Checks a message against the language rules of the day, None if it's fine.
pub fn check_message(
    lid: &Lid,
    settings: &Settings,
    text: &str,
    weekday: u32,
) -> Option<LangViolation> {
    let cleaned = strip_non_letter_or_whitespace_chars(text);
    if cleaned.chars().count() < MIN_MSG_LENGTH {
        debug!("The message is too short for a check, ignoring");
        return None;
    }
    let day = Day::of(settings, weekday).lang();
    if settings.otherlang_checks && detect_other_language(lid, text, &cleaned, day).is_some() {
        info!(text, ?day, "Decided it's a bad language");
        return Some(LangViolation { day, msg: None });
    }
    // NOTE: transliterated Russian (Lid's "ru-latin") is treated as English here, as before:
    // it passes on English days. Counting it as Russian is a deferred decision.
    let Some(day) = day else {
        debug!("No specific language is set for the explicit check");
        return None;
    };
    let Some(msg) = detect_en_ru(&cleaned) else {
        info!("Seems to be a mixed language message, not issuing a warning");
        return None;
    };
    if msg == day {
        return None;
    }
    info!(?msg, ?day, "Language mismatch");
    Some(LangViolation {
        day: Some(day),
        msg: Some(msg),
    })
}

#[derive(Debug, PartialEq)]
pub enum OtherLang {
    Charset,
    Ml {
        confidence: f32,
        unknown_words: usize,
        total_words: usize,
    },
}

/// Detects a message written in a language other than en/ru.
///
/// `cleaned` is `raw_text` after [strip_non_letter_or_whitespace_chars]; the model gets the raw text,
/// as it has its own preprocessing.
pub fn detect_other_language(
    lid: &Lid,
    raw_text: &str,
    cleaned: &str,
    target: Option<Lang>,
) -> Option<OtherLang> {
    let text = cleaned;
    if detect_bad_lang_by_charset(text) {
        debug!("Language mismatch by charset");
        return Some(OtherLang::Charset);
    }

    // Russian morphology gives plenty of ML false positives, being written in cyrillic is good enough
    if target == Some(Lang::Ru) {
        return None;
    }
    if target.is_none() && is_mostly_cyrillic(text) {
        debug!("Free day and message is mostly in cyrillic, skipping ML check");
        return None;
    }

    if text.chars().count() < ML_MIN_LENGTH {
        info!(text, "Text too short for ML recognition");
        return None;
    }

    if is_name_list(text) {
        debug!(text, "Looks like a list of names, skipping ML check");
        return None;
    }

    let Some(detection) = lid.detect(raw_text) else {
        info!(text, "Couldn't determine the language with ML, aborting");
        return None;
    };
    if detection.label != Label::Other {
        debug!(?detection, "Language detected as Russian or English");
        return None;
    }
    if detection.confidence < ML_TARGET_CONFIDENCE {
        info!(
            ?detection,
            "Language detected as NOT Russian or English, but confidence level is too low"
        );
        return None;
    }

    // Filtering out false positives by checking words against the most common en/ru vocab.
    // Less effective for russian due to declension/conjugation, hence the threshold below 100%.
    let words: Vec<String> = text.split_whitespace().map(str::to_lowercase).collect();
    let unknown: Vec<&str> = words
        .iter()
        .map(String::as_str)
        .filter(|w| !EN_WORDS.contains(w) && !RU_WORDS.contains(w))
        .collect();
    let has_plenty_unknown_words =
        unknown.len() as f64 / words.len() as f64 > UNKNOWN_WORDS_THRESHOLD;
    info!(
        ?detection,
        ?unknown,
        total_words = words.len(),
        has_plenty_unknown_words,
        "Language mismatch, checking against dicts to filter out false-positives"
    );
    has_plenty_unknown_words.then_some(OtherLang::Ml {
        confidence: detection.confidence,
        unknown_words: unknown.len(),
        total_words: words.len(),
    })
}

/// Short texts with every word capitalized, e.g. "Harley Quinn" or "Campinas Brazil".
///
/// The model often takes names, places and brands for another language, and they're fine on
/// English days. Foreign greetings like "Guten Morgen" slip through as well, which is acceptable.
fn is_name_list(text: &str) -> bool {
    let words: Vec<&str> = text.split_whitespace().collect();
    words.len() <= MAX_NAME_LIST_WORDS
        && words
            .iter()
            .all(|w| w.chars().next().is_some_and(char::is_uppercase))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lid::Lid;

    #[test]
    fn schedule() {
        let days: Vec<_> = (0..7).map(scheduled_lang).collect();
        use Lang::*;
        assert_eq!(
            days,
            [
                None,
                Some(Ru),
                Some(En),
                Some(Ru),
                Some(En),
                Some(Ru),
                Some(En)
            ]
        );
    }

    const RU_TEXT: &str = "что-то на русском тут написано";
    const EN_TEXT: &str = "something in english here";
    const MONDAY: u32 = 1;
    const TUESDAY: u32 = 2;

    #[test]
    fn checks_message_language_by_day() {
        let lid = Lid::embedded().unwrap();
        let settings = Settings::default();
        let check = |text: &str, weekday| check_message(&lid, &settings, text, weekday);

        assert_eq!(check(RU_TEXT, MONDAY), None);
        assert_eq!(
            check(EN_TEXT, MONDAY),
            Some(LangViolation {
                day: Some(Lang::Ru),
                msg: Some(Lang::En)
            })
        );
        assert_eq!(check(EN_TEXT, TUESDAY), None);
        assert_eq!(
            check(RU_TEXT, TUESDAY),
            Some(LangViolation {
                day: Some(Lang::En),
                msg: Some(Lang::Ru)
            })
        );
        assert_eq!(check(RU_TEXT, 0), None, "free day");
        assert_eq!(check("Hi!", MONDAY), None, "too short");
        assert_eq!(
            check(&format!("{EN_TEXT} {RU_TEXT}"), MONDAY),
            None,
            "bilingual"
        );
        assert!(
            check(&format!("{EN_TEXT} {EN_TEXT} {RU_TEXT}"), MONDAY).is_some(),
            "mostly english"
        );
    }

    #[test]
    fn respects_day_settings() {
        let lid = Lid::embedded().unwrap();
        let forced = Settings {
            forced_lang: Some(Lang::En),
            ..Settings::default()
        };
        assert_eq!(check_message(&lid, &forced, EN_TEXT, MONDAY), None);
        let disabled = Settings {
            langday_checks: false,
            ..Settings::default()
        };
        assert_eq!(check_message(&lid, &disabled, EN_TEXT, MONDAY), None);
        // other language checks still work with en/ru days disabled, as on a free day
        let german = "Ich weiß nicht, ob das heute noch klappt";
        assert_eq!(
            check_message(&lid, &disabled, german, MONDAY),
            Some(LangViolation {
                day: None,
                msg: None
            })
        );
        let no_other = Settings {
            otherlang_checks: false,
            ..Settings::default()
        };
        assert_eq!(check_message(&lid, &no_other, german, 0), None);
    }

    #[test]
    fn weekday_from_timestamp() {
        assert_eq!(weekday_utc(0), 4); // Thu 1970-01-01
        assert_eq!(weekday_utc(1_756_724_518_135), 1); // Mon 2025-09-01T11:01:58Z
        assert_eq!(weekday_utc(1_756_684_799_999), 0); // Sun 2025-08-31T23:59:59.999Z
    }

    #[test]
    fn strips_non_letters() {
        let strip = strip_non_letter_or_whitespace_chars;
        assert_eq!(strip("t😀e!s3t."), "test");
        assert_eq!(strip("test 123 test"), "test test");
        assert_eq!(strip("хай 안녕 123"), "хай 안녕");
        assert_eq!(strip("hi  all"), "hi all");
        assert_eq!(strip("hi \t\t all"), "hi all");
        assert_eq!(strip("\thi all  "), "hi all");
        assert_eq!(
            strip("hi https://example.com/some?id=123&foo=bar#frag all"),
            "hi all"
        );
    }

    #[test]
    fn strips_laughter() {
        let strip = strip_non_letter_or_whitespace_chars;
        assert_eq!(strip("hi ha-ha all"), "hi all");
        assert_eq!(strip("hi he-haha all"), "hi all");
        assert_eq!(strip("hi HAHA all"), "hi all");
        assert_eq!(strip("hihaha all"), "hihaha all");
        assert_eq!(strip("Всем привет ха-ха"), "Всем привет");
        assert_eq!(strip("Всем привет хехе"), "Всем привет");
        assert_eq!(strip("Всем привет ХА"), "Всем привет");
        assert_eq!(strip("ха ха ха привет"), "привет");
    }

    #[test]
    fn en_ru_by_letter_counts() {
        let en = "something in english here";
        let ru = "что-то на русском тут написано";
        assert_eq!(detect_en_ru(en), Some(Lang::En));
        assert_eq!(detect_en_ru(ru), Some(Lang::Ru));
        assert_eq!(detect_en_ru(&format!("{en} {ru}")), None, "bilingual");
        assert_eq!(detect_en_ru(&format!("{en} {en} {ru}")), Some(Lang::En));
        assert_eq!(detect_en_ru("123"), None);
    }

    #[test]
    fn bad_lang_by_charset() {
        let ok = [
            "кажется, наш Боб-зе-бот стал самым активным участником этой группы 😄😄😄",
            "I personally wouldn’t bother unless eon gets himself a ban hammer.",
            "naïve or coöperate",
            "Hi guys, I hope I can learn English and Russian.\n\nПривет, ребята! Надеюсь, я смогу выучить английский и русский.",
            "(╯°□°）╯︵ ┻━┻  ¯\\_(ツ)_/¯",
        ];
        for text in ok {
            assert!(!detect_bad_lang_by_charset(text), "{text:?}");
        }
        assert!(detect_bad_lang_by_charset(
            "你们不能对 Eon 实施制裁！ 西方需要停止殖民"
        ));
        assert!(detect_bad_lang_by_charset("لوحة المفاتيح العربية"));
        // NOTE: 3 accented letters of 41 is below the 95% rate. Same in the TS version,
        // where this case was asserted as false, but the test file was never picked up by the runner.
        assert!(detect_bad_lang_by_charset(
            "Sorry dear bot, my name is Julioé César I’m from Perú "
        ));
    }

    #[test]
    fn other_language() {
        let lid = Lid::embedded().unwrap();
        let detect = |text: &str, target| {
            detect_other_language(
                &lid,
                text,
                &strip_non_letter_or_whitespace_chars(text),
                target,
            )
        };

        assert_eq!(
            detect("你们不能对 Eon 实施制裁！ 西方需要停止殖民", Some(Lang::Ru)),
            Some(OtherLang::Charset)
        );
        assert_eq!(
            detect(
                "I personally wouldn't bother unless he gets himself a ban hammer",
                Some(Lang::En)
            ),
            None
        );
        assert_eq!(
            detect("Ich weiß nicht, ob das heute noch klappt", Some(Lang::Ru)),
            None,
            "only charset on ru days"
        );
        assert_eq!(
            detect("Привет, как дела у всех сегодня вечером", None),
            None,
            "cyrillic on free days"
        );
        assert_eq!(detect("Hallo du", Some(Lang::En)), None, "too short");
        assert_eq!(
            detect("Campinas, SP - Brazil", Some(Lang::En)),
            None,
            "names"
        );
        assert!(
            detect("Ich Weiß Nicht, Ob Das Heute Noch Klappt", Some(Lang::En)).is_some(),
            "capitalized, but too long for a list of names"
        );
        assert!(matches!(
            detect("Ich weiß nicht, ob das heute noch klappt", Some(Lang::En)),
            Some(OtherLang::Ml { .. })
        ));
    }
}
