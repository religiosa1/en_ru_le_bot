import { detectAllLanguagesFast } from "@en-ru-le/language-detection";
import type { Logger } from "pino";
import { LanguageEnum } from "../../../enums/Language.ts";
import { stripNonLetterOrWhitespaceChars } from "../utils.ts";
import { detectByCharset } from "./detectByCharset.ts";
import { mostCommonWordsInEnglish } from "./mostCommonWordsInEnglish.ts";
import { mostCommonWordsInRussian } from "./mostCommonWordsInRussian.ts";

const TARGET_CONFIDENCE_LEVEL = 0.7;

const UNKNOWN_WORDS_THRESHOLD = 0.4;

export async function detectLanguageOutsideOfEnRu(logger: Logger, text: string): Promise<boolean> {
	const cleanedText = stripNonLetterOrWhitespaceChars(text);

	// Initially trying to filter out clearly bad languages, which use wrong script, such as chinese
	if (detectByCharset(cleanedText)) {
		logger.debug("Language mismatch by charset");
		return true;
	}

	// If it's strictly latin/cyrillic -- going for lingua-rs detection
	const lang = await detectAllLanguagesFast(cleanedText);
	if (lang == null) {
		logger.warn({ cleanedText, text }, "Couldn't determine the language with ML, aborting");
		return false;
	}

	if (lang.language === LanguageEnum.Russian || lang.language === LanguageEnum.English) {
		logger.debug({ language: lang.language, confidence: lang.confidence }, "Language detected as Russian or English");
		return false;
	}
	if (lang.confidence < TARGET_CONFIDENCE_LEVEL) {
		logger.info(
			{ language: lang.language, confidence: lang.confidence },
			"Language detected as NOT Russian or English, but confidence level is too low",
		);
		return false;
	}

	// Language detected as something else, but we need to have safety measures against false positives.
	// We're comparing words against the set of 5000 most common words in both eng and ru.
	// In russian the effectiveness will be much lower, because of the declension/conjugation system, hence we need to
	// set success rate somewhat lower than ideal.

	const words = cleanedText.split(/\s+/).map((i) => i.toLowerCase());
	if (!words.length) {
		logger.info("No words detected");
		return false;
	}
	const nonRecognizedWords = words.filter((w) => !mostCommonWordsInEnglish.has(w) && !mostCommonWordsInRussian.has(w));
	const hasPlentyUnknownWords = nonRecognizedWords.length / words.length > UNKNOWN_WORDS_THRESHOLD;
	logger.info(
		{
			nonRecognizedWords,
			hasPlentyUnknownWords,
			totalWords: words.length,
			totalUnrecognized: nonRecognizedWords.length,
		},
		"Language mismatch, checking against dicts to filter out false-positives",
	);
	return hasPlentyUnknownWords;
}
