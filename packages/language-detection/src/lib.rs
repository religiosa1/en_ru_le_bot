use lingua::Language::{English, Latin, Russian, Sotho, Tagalog};
use lingua::{LanguageDetector, LanguageDetectorBuilder};

// #![deny(clippy::all)]

use napi_derive::napi;

#[napi(object)]
pub struct NapiDetectedLanguage {
  pub start_index: u32,
  pub end_index: u32,
  pub word_count: u32,
  pub language: String,
}

/// High accuracy detections, but only detects Russian or English.
/// This is intended to find direct language policy violation (using English on
/// a Russian day or vice versa), but won't detect usage of any other language
/// outside of those two.
/// Confidence isn't calculated here, because it's meaningless.
#[napi]
pub fn is_russian_or_english(input: String) -> Vec<NapiDetectedLanguage> {
  let detector: LanguageDetector = LanguageDetectorBuilder::from_languages(&[English, Russian])
    .with_preloaded_language_models()
    .build();

  let result = detector.detect_multiple_languages_of(input);

  result
    .into_iter()
    .map(|d| NapiDetectedLanguage {
      start_index: d.start_index().try_into().unwrap_or(u32::MAX),
      end_index: d.end_index().try_into().unwrap_or(u32::MAX),
      word_count: d.word_count().try_into().unwrap_or(u32::MAX),
      language: d.language().iso_code_639_1().to_string(),
    })
    .collect()
}

/// Low accuracy detection of all available languages. This will detect any
/// supported language, besides explicitly filtered out because of higher amount
/// of false positives.
#[napi]
pub fn detect_all_languages_fast(input: String) -> Vec<NapiDetectedLanguage> {
  let detector: LanguageDetector =
    LanguageDetectorBuilder::from_all_languages_without(&[Tagalog, Sotho, Latin])
      .with_preloaded_language_models()
      .with_low_accuracy_mode()
      .build();

  let result = detector.detect_multiple_languages_of(input);

  result
    .into_iter()
    .map(|d| NapiDetectedLanguage {
      start_index: d.start_index().try_into().unwrap_or(u32::MAX),
      end_index: d.end_index().try_into().unwrap_or(u32::MAX),
      word_count: d.word_count().try_into().unwrap_or(u32::MAX),
      language: d.language().iso_code_639_1().to_string(),
    })
    .collect()
}
