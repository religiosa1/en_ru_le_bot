//! Language identification with the fastText model trained on the chat (examples/lid_train.rs).
//!
//! The model is compiled into the binary, so retraining it means rebuilding the bot.

use std::path::Path;
use std::sync::LazyLock;

use anyhow::{Context, bail};
use fasttext::FastText;
use regex::Regex;

pub struct Lid(FastText);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Label {
    En,
    Ru,
    /// Transliterated Russian
    RuLatin,
    /// Neither English nor Russian
    Other,
}

impl Label {
    /// Name used in the model and the dataset.
    pub fn name(self) -> &'static str {
        match self {
            Label::En => "en",
            Label::Ru => "ru",
            Label::RuLatin => "ru-latin",
            Label::Other => "other",
        }
    }

    fn from_fasttext(label: &str) -> Option<Self> {
        let name = label.strip_prefix("__label__")?;
        [Label::En, Label::Ru, Label::RuLatin, Label::Other]
            .into_iter()
            .find(|l| l.name() == name)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Detection {
    pub label: Label,
    pub confidence: f32,
}

/// Written by examples/lid_train.rs
static EMBEDDED_MODEL: &[u8] = include_bytes!("../models/lid-chat.ftz");

impl Lid {
    /// The model compiled into the binary.
    pub fn embedded() -> anyhow::Result<Self> {
        Self::new(FastText::load(&mut &EMBEDDED_MODEL[..]).context("load embedded language model")?)
    }

    /// A model from a file, e.g. to evaluate another one.
    pub fn load(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let path = path.as_ref();
        Self::new(
            FastText::load_model(path).with_context(|| format!("load language model {path:?}"))?,
        )
    }

    /// Fails for models with labels we don't know, rather than silently never matching them.
    fn new(model: FastText) -> anyhow::Result<Self> {
        for label in model.get_labels().0 {
            if Label::from_fasttext(&label).is_none() {
                bail!("unknown language model label {label:?}");
            }
        }
        Ok(Self(model))
    }

    /// Most likely label of a raw message text, None if there's nothing to detect.
    pub fn detect(&self, text: &str) -> Option<Detection> {
        let prediction = self
            .0
            .predict(&normalize(text), 1, 0.0)
            .into_iter()
            .next()?;
        Some(Detection {
            label: Label::from_fasttext(&prediction.label)?,
            confidence: prediction.prob,
        })
    }
}

pub static URL_OR_MENTION_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[A-Za-z0-9_]{2,8}://\S+|@\w+").unwrap());

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
        assert_eq!(
            normalize("That’s cute!! 😄 https://x.com/a?b=1 @some_user"),
            "that's cute"
        );
        assert_eq!(normalize("Привет,\n\tкак дела? 123"), "привет как дела");
        assert_eq!(normalize("¯\\_(ツ)_/¯"), "ツ");
    }

    #[test]
    fn detects_languages() {
        let lid = Lid::embedded().unwrap();
        for (text, expected) in [
            (
                "I personally wouldn't bother unless he gets himself a ban hammer",
                Label::En,
            ),
            ("Interesting", Label::En),
            (
                "кажется наш бот стал самым активным участником этой группы",
                Label::Ru,
            ),
            ("privet, kak dela? chto novogo?", Label::RuLatin),
            (
                "Ça les fait travailler vite et ils sont contents",
                Label::Other,
            ),
            ("Ich weiß nicht, ob das heute noch klappt", Label::Other),
        ] {
            assert_eq!(lid.detect(text).unwrap().label, expected, "{text:?}");
        }
    }
}
