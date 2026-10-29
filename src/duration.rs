//! Human-readable durations, e.g. "1h30m", "1.5d", "20" (bare number = minutes).

use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;

pub const fn seconds(n: u64) -> Duration {
    Duration::from_secs(n)
}

pub const fn minutes(n: u64) -> Duration {
    Duration::from_mins(n)
}

pub const fn hours(n: u64) -> Duration {
    Duration::from_hours(n)
}

pub const fn days(n: u64) -> Duration {
    Duration::from_hours(n * 24)
}

/// Units in descending order, components of a duration string must follow it.
const UNITS: [(&str, Duration); 5] = [
    ("d", days(1)),
    ("h", hours(1)),
    ("m", minutes(1)),
    ("s", seconds(1)),
    ("ms", Duration::from_millis(1)),
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
    for (suffix, unit) in UNITS {
        let unit_ms = unit.as_millis() as u64;
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
        return millis_to_duration(input.parse::<f64>().ok()? * minutes(1).as_millis() as f64);
    }

    let mut total_ms = 0.0;
    let mut consumed = 0;
    let mut last_unit = Duration::MAX;
    for caps in COMPONENT_RE.captures_iter(input) {
        let whole = caps.get(0)?;
        // Some garbage between components
        if whole.start() != consumed {
            return None;
        }
        consumed = whole.end();

        let unit = UNITS.iter().find(|(suffix, _)| *suffix == &caps[2])?.1;
        if unit >= last_unit {
            return None;
        }
        last_unit = unit;
        total_ms += caps[1].parse::<f64>().ok()? * unit.as_millis() as f64;
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
        assert_eq!(format_duration(seconds(42)), "42s");
        assert_eq!(format_duration(minutes(42)), "42m");
        assert_eq!(format_duration(hours(3)), "3h");
        assert_eq!(format_duration(days(3)), "3d");
        assert_eq!(format_duration(ms(0)), "0");
    }

    #[test]
    fn formats_compound_durations() {
        assert_eq!(format_duration(days(1) + hours(2) + minutes(3)), "1d2h3m");
        assert_eq!(format_duration(minutes(1) + seconds(2) + ms(3)), "1m2s3ms");
        assert_eq!(format_duration(days(1) + hours(2)), "1d2h");
        assert_eq!(format_duration(days(1) + minutes(3)), "1d3m");
        assert_eq!(format_duration(hours(1) + seconds(3)), "1h3s");
    }

    #[test]
    fn formats_up_to_3_components() {
        assert_eq!(
            format_duration(days(1) + hours(2) + minutes(3) + seconds(4) + ms(5)),
            "1d2h3m"
        );
        assert_eq!(format_duration(seconds(20) + ms(100)), "20s100ms");
    }

    #[test]
    fn parses_durations() {
        assert_eq!(parse_duration("3h"), Some(hours(3)));
        assert_eq!(parse_duration("3s10ms"), Some(seconds(3) + ms(10)));
        assert_eq!(parse_duration("3h10m"), Some(hours(3) + minutes(10)));
        assert_eq!(parse_duration("3h10s"), Some(hours(3) + seconds(10)));
        assert_eq!(parse_duration("3h0m10s"), Some(hours(3) + seconds(10)));
        assert_eq!(parse_duration("0h"), Some(ms(0)));
        assert_eq!(parse_duration("0"), Some(ms(0)));
    }

    #[test]
    fn parses_fractions() {
        assert_eq!(parse_duration("0.5h"), Some(minutes(30)));
        assert_eq!(parse_duration(".5h"), Some(minutes(30)));
        assert_eq!(parse_duration("0.5h.25m"), Some(minutes(30) + seconds(15)));
        assert_eq!(parse_duration("1.5d"), Some(hours(36)));
    }

    #[test]
    fn bare_number_is_minutes() {
        assert_eq!(parse_duration("12"), Some(minutes(12)));
        assert_eq!(parse_duration("1.5"), Some(seconds(90)));
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
        for value in [minutes(15), hours(3), days(1) + hours(2) + minutes(3)] {
            assert_eq!(parse_duration(&format_duration(value)), Some(value));
        }
    }
}
