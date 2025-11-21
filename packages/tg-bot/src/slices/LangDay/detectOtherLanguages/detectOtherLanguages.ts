import { detectAllLanguagesFast } from "@en-ru-le/language-detection";
import type { Logger } from "pino";
import { LanguageEnum } from "../../../enums/Language.ts";
import { stripNonLetterOrWhitespaceChars } from "../utils.ts";
import { detectBadLangByCharset } from "./detectBadLangByCharset.ts";
import { mostCommonWordsInEnglish } from "./mostCommonWordsInEnglish.ts";
import { mostCommonWordsInRussian } from "./mostCommonWordsInRussian.ts";

const MIN_LENGTH = 10;

const TARGET_CONFIDENCE_LEVEL = 0.7;

// More than half of words in a sentence must be unknown
const UNKNOWN_WORDS_THRESHOLD = 0.6;

interface MlLangMismatchResult {
	mechanism: "ml";
	nonRecognizedWords: string[];
	hasPlentyUnknownWords: boolean;
	totalWords: number;
	totalUnrecognized: number;
	cleanedTextLength: number;
}

type OtherLanguageDetectionResult =
	| {
			mechanism: "charset";
	  }
	| MlLangMismatchResult;

export async function detectLanguageOutsideOfEnRu(
	logger: Logger,
	text: string,
	targetLanguage: LanguageEnum | undefined,
): Promise<OtherLanguageDetectionResult | undefined> {
	const cleanedText = stripNonLetterOrWhitespaceChars(text);

	// Initially trying to filter out clearly bad languages, which use wrong script, such as chinese
	if (detectBadLangByCharset(cleanedText)) {
		logger.debug("Language mismatch by charset");
		return { mechanism: "charset" };
	}

	if (cleanedText.length < MIN_LENGTH) {
		logger.info({ cleanedText, text }, "Text too short for ML recognition");
		return undefined;
	}

	// If target language is russian, we're not doing any other checks outside of charset, as Russian
	// morphology system makes it tricky to filter out false positives. Being written in cyrillic should be good enough
	if (targetLanguage === LanguageEnum.Russian) {
		return undefined;
	}

	// If it's strictly latin/cyrillic -- going for lingua-rs detection
	const lang = await detectAllLanguagesFast(cleanedText);
	if (lang == null) {
		logger.warn({ cleanedText, text }, "Couldn't determine the language with ML, aborting");
		return undefined;
	}

	if (lang.language === LanguageEnum.Russian || lang.language === LanguageEnum.English) {
		logger.debug(
			{ language: lang.language, confidence: lang.confidence },
			"Language detected as Russian or English",
		);
		return undefined;
	}
	if (lang.confidence < TARGET_CONFIDENCE_LEVEL) {
		logger.info(
			{ language: lang.language, confidence: lang.confidence },
			"Language detected as NOT Russian or English, but confidence level is too low",
		);
		return undefined;
	}

	// Language detected as something else, but we need to have safety measures against false positives.
	// We're comparing words against the set of 5000 most common words in both eng and ru.
	// In russian the effectiveness will be much lower, because of the declension/conjugation system, hence we need to
	// set success rate somewhat lower than ideal.

	const words = cleanedText.split(/\s+/).map((i) => i.toLowerCase());
	if (!words.length) {
		logger.info({ cleanedText }, "No words detected");
		return undefined;
	}
	const nonRecognizedWords = words.filter(
		(w) => !mostCommonWordsInEnglish.has(w) && !mostCommonWordsInRussian.has(w),
	);
	const hasPlentyUnknownWords = nonRecognizedWords.length / words.length > UNKNOWN_WORDS_THRESHOLD;
	const mismatchResult: MlLangMismatchResult = {
		nonRecognizedWords,
		hasPlentyUnknownWords,
		totalWords: words.length,
		totalUnrecognized: nonRecognizedWords.length,
		mechanism: "ml",
		cleanedTextLength: cleanedText.length,
	};
	logger.info(
		mismatchResult,
		"Language mismatch, checking against dicts to filter out false-positives",
	);
	return hasPlentyUnknownWords ? mismatchResult : undefined;
}
