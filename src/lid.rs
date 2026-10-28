//! Language identification with the fastText model trained on the chat (examples/lid_train.rs).

use std::path::Path;
use std::sync::LazyLock;

use anyhow::Context;
use fasttext::FastText;
use regex::Regex;

pub struct Lid(FastText);

#[derive(Debug, Clone, PartialEq)]
pub struct Detection {
    /// One of "en", "ru", "ru-latin", "other"
    pub label: String,
    pub confidence: f32,
}

impl Lid {
    pub fn load(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let path = path.as_ref();
        let model = FastText::load_model(path).with_context(|| format!("load language model {path:?}"))?;
        Ok(Self(model))
    }

    /// Most likely label of a raw message text, None if there's nothing to detect.
    pub fn detect(&self, text: &str) -> Option<Detection> {
        let prediction = self.0.predict(&normalize(text), 1, 0.0).into_iter().next()?;
        Some(Detection {
            label: prediction.label.trim_start_matches("__label__").to_string(),
            confidence: prediction.prob,
        })
    }
}

/// Model at the default dev location, for tests and tools.
pub fn load_dev_model() -> Lid {
    Lid::load(concat!(env!("CARGO_MANIFEST_DIR"), "/models/lid-chat.ftz"))
        .expect("model missing, run examples/lid_train.rs")
}

static URL_OR_MENTION_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[A-Za-z0-9_]{2,8}://\S+|@\w+").unwrap());

/// Text preprocessing for the chat language model, the same for training and detection.
///
/// Apostrophes are kept, as contractions are a strong signal for English.
pub fn normalize(text: &str) -> String {
    let text = URL_OR_MENTION_RE.replace_all(text, " ").to_lowercase();
    let text: String = text
        .chars()
        .map(|c| match c {
            '’' | '‘' | '`' | '\'' => '\'',
            c if c.is_alphabetic() => c,
            _ => ' ',
        })
        .collect();
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_text() {
        assert_eq!(normalize("That’s cute!! 😄 https://x.com/a?b=1 @some_user"), "that's cute");
        assert_eq!(normalize("Привет,\n\tкак дела? 123"), "привет как дела");
        assert_eq!(normalize("¯\\_(ツ)_/¯"), "ツ");
    }

    #[test]
    fn detects_languages() {
        let lid = load_dev_model();
        for (text, expected) in [
            ("I personally wouldn't bother unless he gets himself a ban hammer", "en"),
            ("Interesting", "en"),
            ("кажется наш бот стал самым активным участником этой группы", "ru"),
            ("privet, kak dela? chto novogo?", "ru-latin"),
            ("Ça les fait travailler vite et ils sont contents", "other"),
            ("Ich weiß nicht, ob das heute noch klappt", "other"),
        ] {
            assert_eq!(lid.detect(text).unwrap().label, expected, "{text:?}");
        }
    }
}
