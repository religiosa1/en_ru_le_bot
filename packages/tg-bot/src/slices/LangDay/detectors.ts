import { Tongue } from "@desert-ant-labs/tongue";
import * as lingua from "@en-ru-le/language-detection";
import { match } from "ts-pattern";
import { LanguageEnum } from "../../enums/Language.ts";

export const DetectorName = {
	Lingua: "lingua",
	Tongue: "tongue",
} as const;
export type DetectorName = (typeof DetectorName)[keyof typeof DetectorName];

export function isDetectorName(value: unknown): value is DetectorName {
	return (Object.values(DetectorName) as unknown[]).includes(value);
}

export interface OtherLanguageDetection {
	/** ISO 639-1 (or 639-3 for tongue) language code */
	language: string;
	confidence: number;
}

/** Engine-specific part of the language check, the heuristics around it are shared. */
export interface LanguageDetector {
	/** Most likely language among all languages known by the detector */
	detectAnyLanguage(text: string): Promise<OtherLanguageDetection | null>;
	/** Main language of a message, undefined if it's mixed or undeterminable */
	detectEnRu(text: string): Promise<LanguageEnum | undefined>;
}

let tongue: Promise<Tongue> | undefined;
/** Loads tongue model once, subsequent calls return the same instance. */
export function loadTongue(): Promise<Tongue> {
	tongue ??= Tongue.load();
	return tongue;
}

export const detectors: Record<DetectorName, LanguageDetector> = {
	lingua: {
		detectAnyLanguage: (text) => lingua.detectAllLanguagesFast(text),
		async detectEnRu(text) {
			const fragments = await lingua.isRussianOrEnglish(text);
			let ruLength = 0;
			let enLength = 0;
			for (const fragment of fragments) {
				const length = fragment.endIndex - fragment.startIndex;
				if (fragment.language === LanguageEnum.Russian) ruLength += length;
				else if (fragment.language === LanguageEnum.English) enLength += length;
				else throw new Error(`Unexpected language in the detection result: ${fragment.language}`);
			}
			return pickMainLanguage(ruLength, enLength);
		},
	},
	tongue: {
		async detectAnyLanguage(text) {
			const { language, candidates, reliability, isTooCloseToCall } = (await loadTongue()).detect(text, 3);
			if (language == null) return null;
			// extra fields aren't used by the heuristics, but end up in the logs
			return { language, confidence: candidates[0]?.probability ?? 0, reliability, isTooCloseToCall, candidates };
		},
		// ponytail: tongue has no multi-language segmentation, but en and ru don't share a script,
		// so letter counts give the same split lingua's segments do
		async detectEnRu(text) {
			return pickMainLanguage(countMatches(text, cyrillicRe), countMatches(text, latinRe));
		},
	},
};

const cyrillicRe = /\p{Script=Cyrillic}/gu;
const latinRe = /\p{Script=Latin}/gu;

function countMatches(text: string, re: RegExp): number {
	return text.match(re)?.length ?? 0;
}

/** Rate of one language over the other, when we start considering "it's written in language A"! */
const REQUIRED_LANGUAGE_RATE = 1.7;

/**
 * If we have both languages in the message, there must be more of one lang over the other
 * for us to say "it's in the language foo"! Otherwise, we should consider it a text written in
 * both languages, and we shouldn't give a warning for a text like that.
 */
export function pickMainLanguage(ruLength: number, enLength: number): LanguageEnum | undefined {
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
