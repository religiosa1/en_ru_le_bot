use lingua::Language::{English, Latin, Russian, Sotho, Tagalog};
use lingua::{LanguageDetector, LanguageDetectorBuilder};
use std::sync::OnceLock;

use napi_derive::napi;

static RUSSIAN_ENGLISH_DETECTOR: OnceLock<LanguageDetector> = OnceLock::new();
static ALL_LANGUAGES_DETECTOR: OnceLock<LanguageDetector> = OnceLock::new();

/// Language detection result
#[napi(object)]
pub struct DetectedLanguage {
  /// Start index in characters
  pub start_index: u32,
  /// End index in characters
  pub end_index: u32,
  /// Count of words in this language
  pub word_count: u32,
  /// ISO 639-1 language code, e.g. "en", "ru"
  pub language: String,
}

impl DetectedLanguage {
  fn from(value: lingua::DetectionResult, message: &str) -> Self {
    let start_index: u32 = message[..value.start_index()]
      .chars()
      .count()
      .try_into()
      .unwrap_or(u32::MAX);
    let end_index: u32 = message[..value.end_index()]
      .chars()
      .count()
      .try_into()
      .unwrap_or(u32::MAX);

    Self {
      start_index,
      end_index,
      word_count: value.word_count().try_into().unwrap_or(u32::MAX),
      language: value.language().iso_code_639_1().to_string(),
    }
  }
}

/// High accuracy detections, but only detects Russian or English.
/// This is intended to find direct language policy violation (using English on
/// a Russian day or vice versa), but won't detect usage of any other language
/// outside of those two.
/// Confidence isn't calculated here, because it's meaningless.
#[napi]
pub async fn is_russian_or_english(input: String) -> Vec<DetectedLanguage> {
  let detector = RUSSIAN_ENGLISH_DETECTOR.get_or_init(load_russian_english_detector);
  let result = detector.detect_multiple_languages_of(&input);
  result
    .into_iter()
    .map(|d| DetectedLanguage::from(d, &input))
    .collect()
}

/// Low accuracy detection of all available languages. This will detect any
/// supported language, besides explicitly filtered out because of higher amount
/// of false positives.
#[napi]
pub async fn detect_all_languages_fast(input: String) -> Vec<DetectedLanguage> {
  let detector = ALL_LANGUAGES_DETECTOR.get_or_init(load_all_languages_detector);
  let result = detector.detect_multiple_languages_of(&input);
  result
    .into_iter()
    .map(|d| DetectedLanguage::from(d, &input))
    .collect()
}

/// Preload language models.
///
/// Without a call to this method language models will be lazily initialized,
/// Dramatically increasing first detection call latency.
#[napi]
pub fn load_language_models() {
  RUSSIAN_ENGLISH_DETECTOR.get_or_init(load_russian_english_detector);
  ALL_LANGUAGES_DETECTOR.get_or_init(load_all_languages_detector);
}

fn load_russian_english_detector() -> LanguageDetector {
  LanguageDetectorBuilder::from_languages(&[English, Russian])
    .with_preloaded_language_models()
    .build()
}

/// List of languages explicitly excluded from all languages detection, because of higher
/// false positive detection values.
const FALSE_POSITIVE_LANGUAGES: &[lingua::Language] = &[Tagalog, Sotho, Latin];

fn load_all_languages_detector() -> LanguageDetector {
  LanguageDetectorBuilder::from_all_languages_without(FALSE_POSITIVE_LANGUAGES)
    .with_preloaded_language_models()
    .with_low_accuracy_mode()
    .build()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn calculates_correct_char_indices() {
    let russian_text = "Половина текста тут на русском ";
    let english_text = "and half's in English";
    let input = format!("{russian_text}{english_text}");
    let result = is_russian_or_english(input.clone()).await;
    let rus_index = russian_text.chars().count() as u32;

    assert_eq!(result[0].start_index, 0);
    assert_eq!(result[0].end_index, rus_index);
    assert_eq!(result[0].language, "ru");

    assert_eq!(result[1].start_index, rus_index);
    assert_eq!(result[1].end_index, input.chars().count() as u32);
    assert_eq!(result[1].language, "en");
  }
}
