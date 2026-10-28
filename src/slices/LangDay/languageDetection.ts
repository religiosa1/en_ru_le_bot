import { type Detection, Tongue } from "@desert-ant-labs/tongue";
import { match } from "ts-pattern";
import { LanguageEnum } from "../../enums/Language.ts";

let tongue: Promise<Tongue> | undefined;
/** Loads tongue model once, subsequent calls return the same instance. */
export function loadTongue(): Promise<Tongue> {
	tongue ??= Tongue.load();
	return tongue;
}

export interface AnyLanguageDetection extends Pick<Detection, "reliability" | "isTooCloseToCall" | "candidates"> {
	/** ISO 639-1 or 639-3 language code */
	language: string;
	/** Probability of the top candidate */
	confidence: number;
}

/** Most likely language among all languages known by tongue */
export async function detectAnyLanguage(text: string): Promise<AnyLanguageDetection | null> {
	const { language, candidates, reliability, isTooCloseToCall } = (await loadTongue()).detect(text, 3);
	if (language == null) return null;
	return { language, confidence: candidates[0]?.probability ?? 0, reliability, isTooCloseToCall, candidates };
}

const cyrillicRe = /\p{Script=Cyrillic}/gu;
const latinRe = /\p{Script=Latin}/gu;

/**
 * Main language of a message, undefined if it's mixed or has no letters.
 *
 * Based on letter counts, as en and ru don't share a script.
 */
export function detectEnRu(text: string): LanguageEnum | undefined {
	return pickMainLanguage(text.match(cyrillicRe)?.length ?? 0, text.match(latinRe)?.length ?? 0);
}

/** Rate of one language over the other, when we start considering "it's written in language A"! */
const REQUIRED_LANGUAGE_RATE = 1.7;

/**
 * If we have both languages in the message, there must be more of one lang over the other
 * for us to say "it's in the language foo"! Otherwise, we should consider it a text written in
 * both languages, and we shouldn't give a warning for a text like that.
 */
function pickMainLanguage(ruLength: number, enLength: number): LanguageEnum | undefined {
	if (!ruLength && !enLength) return undefined;
	if (!ruLength) return LanguageEnum.English;
	if (!enLength) return LanguageEnum.Russian;

	return match(ruLength / enLength)
		.when(
			(r) => r < 1 / REQUIRED_LANGUAGE_RATE,
			() => LanguageEnum.English,
		)
		.when(
			(r) => r > REQUIRED_LANGUAGE_RATE,
			() => LanguageEnum.Russian,
		)
		.otherwise(() => undefined);
}
