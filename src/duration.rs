//! Human-readable durations, e.g. "1h30m", "1.5d", "20" (bare number = minutes).

use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;

const SECOND: u64 = 1000;
const MINUTE: u64 = 60 * SECOND;
const HOUR: u64 = 60 * MINUTE;
/// In ms
pub const DAY: u64 = 24 * HOUR;

/// Units in descending order, components of a duration string must follow it.
const UNITS: [(&str, u64); 5] = [
    ("d", DAY),
    ("h", HOUR),
    ("m", MINUTE),
    ("s", SECOND),
    ("ms", 1),
];

/// Formats a duration with up to 3 most significant components, e.g. "1d2h3m".
pub fn format_duration(duration: Duration) -> String {
    format_components(duration, 3)
}

fn format_components(duration: Duration, max_components: usize) -> String {
    let mut remaining = duration.as_millis() as u64;
    if remaining == 0 {
        return "0".into();
    }
    let mut result = String::new();
    let mut n_components = 0;
    for (suffix, unit_ms) in UNITS {
        if remaining < unit_ms {
            continue;
        }
        n_components += 1;
        if n_components > max_components {
            break;
        }
        result += &format!("{}{suffix}", remaining / unit_ms);
        remaining %= unit_ms;
    }
    result
}

static NUMBER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?:\d+(?:\.\d+)?|\.\d+)$").unwrap());
static COMPONENT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\d+(?:\.\d+)?|\.\d+)(ms|d|h|m|s)").unwrap());

/// Parses a duration string. Bare numbers are interpreted as minutes.
///
/// Components must go in descending order and cover the whole string.
pub fn parse_duration(input: &str) -> Option<Duration> {
    if NUMBER_RE.is_match(input) {
        return millis_to_duration(input.parse::<f64>().ok()? * MINUTE as f64);
    }

    let mut total_ms = 0.0;
    let mut consumed = 0;
    let mut last_unit_ms = u64::MAX;
    for caps in COMPONENT_RE.captures_iter(input) {
        let whole = caps.get(0)?;
        // Some garbage between components
        if whole.start() != consumed {
            return None;
        }
        consumed = whole.end();

        let unit_ms = UNITS.iter().find(|(suffix, _)| *suffix == &caps[2])?.1;
        if unit_ms >= last_unit_ms {
            return None;
        }
        last_unit_ms = unit_ms;
        total_ms += caps[1].parse::<f64>().ok()? * unit_ms as f64;
    }
    if consumed == 0 || consumed != input.len() {
        return None;
    }
    millis_to_duration(total_ms)
}

fn millis_to_duration(ms: f64) -> Option<Duration> {
    ms.is_finite()
        .then(|| Duration::from_millis(ms.round() as u64))
}

/// Serde adapter storing durations as human-readable strings, without precision loss.
pub mod as_str {
    use super::*;
    use serde::{Deserialize, Deserializer, Serializer, de::Error};

    pub fn serialize<S: Serializer>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&format_components(*duration, UNITS.len()))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Duration, D::Error> {
        let value = String::deserialize(deserializer)?;
        parse_duration(&value)
            .ok_or_else(|| D::Error::custom(format!("invalid duration {value:?}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn ms(value: u64) -> Duration {
        Duration::from_millis(value)
    }

    #[test]
    fn formats_single_units() {
        assert_eq!(format_duration(ms(42)), "42ms");
        assert_eq!(format_duration(ms(42 * SECOND)), "42s");
        assert_eq!(format_duration(ms(42 * MINUTE)), "42m");
        assert_eq!(format_duration(ms(3 * HOUR)), "3h");
        assert_eq!(format_duration(ms(3 * DAY)), "3d");
        assert_eq!(format_duration(ms(0)), "0");
    }

    #[test]
    fn formats_compound_durations() {
        assert_eq!(format_duration(ms(DAY + 2 * HOUR + 3 * MINUTE)), "1d2h3m");
        assert_eq!(format_duration(ms(MINUTE + 2 * SECOND + 3)), "1m2s3ms");
        assert_eq!(format_duration(ms(DAY + 2 * HOUR)), "1d2h");
        assert_eq!(format_duration(ms(DAY + 3 * MINUTE)), "1d3m");
        assert_eq!(format_duration(ms(HOUR + 3 * SECOND)), "1h3s");
    }

    #[test]
    fn formats_up_to_3_components() {
        assert_eq!(
            format_duration(ms(DAY + 2 * HOUR + 3 * MINUTE + 4 * SECOND + 5)),
            "1d2h3m"
        );
        assert_eq!(format_duration(ms(20 * SECOND + 100)), "20s100ms");
    }

    #[test]
    fn parses_durations() {
        assert_eq!(parse_duration("3h"), Some(ms(3 * HOUR)));
        assert_eq!(parse_duration("3s10ms"), Some(ms(3 * SECOND + 10)));
        assert_eq!(parse_duration("3h10m"), Some(ms(3 * HOUR + 10 * MINUTE)));
        assert_eq!(parse_duration("3h10s"), Some(ms(3 * HOUR + 10 * SECOND)));
        assert_eq!(parse_duration("3h0m10s"), Some(ms(3 * HOUR + 10 * SECOND)));
        assert_eq!(parse_duration("0h"), Some(ms(0)));
        assert_eq!(parse_duration("0"), Some(ms(0)));
    }

    #[test]
    fn parses_fractions() {
        assert_eq!(parse_duration("0.5h"), Some(ms(30 * MINUTE)));
        assert_eq!(parse_duration(".5h"), Some(ms(30 * MINUTE)));
        assert_eq!(
            parse_duration("0.5h.25m"),
            Some(ms(30 * MINUTE + 15 * SECOND))
        );
        assert_eq!(parse_duration("1.5d"), Some(ms(36 * HOUR)));
    }

    #[test]
    fn bare_number_is_minutes() {
        assert_eq!(parse_duration("12"), Some(ms(12 * MINUTE)));
        assert_eq!(parse_duration("1.5"), Some(ms(90 * SECOND)));
    }

    #[test]
    fn rejects_malformed() {
        for input in [
            "", "12q2m", "deadbeef", "10m3h", "3h 10m", "3hh", "-3h", "h",
        ] {
            assert_eq!(parse_duration(input), None, "{input:?}");
        }
    }

    #[test]
    fn format_parse_roundtrip() {
        for value in [
            ms(15 * MINUTE),
            ms(3 * HOUR),
            ms(DAY + 2 * HOUR + 3 * MINUTE),
        ] {
            assert_eq!(parse_duration(&format_duration(value)), Some(value));
        }
    }
}
