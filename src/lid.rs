//! Language identification of any language known by lingua.

use lingua::{LanguageDetector, LanguageDetectorBuilder};

pub struct Lid(LanguageDetector);

#[derive(Debug, Clone, PartialEq)]
pub struct Detection {
    /// ISO 639-1 code, e.g. "en"
    pub language: String,
    pub confidence: f64,
}

impl Lid {
    /// Loads all language models upfront, takes a few seconds.
    ///
    /// Low accuracy mode has plenty of false positives, which are filtered out by the caller.
    pub fn load() -> Self {
        Self(
            LanguageDetectorBuilder::from_all_languages()
                .with_preloaded_language_models()
                .with_low_accuracy_mode()
                .build(),
        )
    }

    /// Most likely language, None if it's too close to call.
    pub fn detect(&self, text: &str) -> Option<Detection> {
        let language = self.0.detect_language_of(text)?;
        Some(Detection {
            language: language.iso_code_639_1().to_string(),
            confidence: self.0.compute_language_confidence(text, language),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_languages() {
        let lid = Lid::load();
        for (text, expected) in [
            ("I personally wouldn't bother unless he gets himself a ban hammer", "en"),
            ("кажется наш бот стал самым активным участником этой группы", "ru"),
            ("Ça les fait travailler vite et ils sont contents", "fr"),
            ("Ich weiß nicht, ob das heute noch klappt", "de"),
        ] {
            assert_eq!(lid.detect(text).unwrap().language, expected, "{text:?}");
        }
    }
}
