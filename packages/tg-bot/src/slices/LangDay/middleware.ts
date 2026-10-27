import type { NextFunction } from "grammy";
import type { Logger } from "pino";
import type { BotContext } from "../../BotContext.ts";
import type { LanguageEnum } from "../../enums/Language.ts";
import { Time } from "../../enums/Time.ts";
import type { BotContextWithMsgLanguage } from "../../models/BotContextWithMsgLanguage.ts";
import { attempt } from "../../utils/attempt.ts";
import { detectLanguageOutsideOfEnRu } from "./detectOtherLanguages/detectOtherLanguages.ts";
import { DetectorName, detectors, type LanguageDetector, type OtherLanguageDetection } from "./detectors.ts";
import type { Verdict } from "./shadowStatsRepository.ts";
import { stripNonLetterOrWhitespaceChars } from "./utils.ts";

const MIN_MSG_LENGTH = 5;

/**
 * As telegram can sent a lot of messages that we missed in updates, we don't want to be triggered on old messages.
 * This const determines how long ago a message should be sent, so we're checking for it.
 */
const MESSAGE_AGE_THRESHOLD = 5 * Time.Minutes;

/**
 * This is the main method of the bot -- the one that checks users messages for a language mismatch.
 * If a mismatch encountered, it routes request to the next middleware, otherwise it aborts the chain.
 */
export async function checkMessageLanguage(ctx: BotContext, next?: NextFunction) {
	const logger = ctx.getLogger("lang_day::middleware::check_message_lang");
	logger.debug(
		{
			text: ctx.message?.text,
		},
		"Message received",
	);
	const { chatAdminRepo, langDayService } = ctx.container;
	if (!ctx.message) {
		logger.info("No message object is present");
		return;
	}
	if (ctx.message.date) {
		const messageDateMs = ctx.message.date * Time.Seconds;
		const messageAge = Date.now() - messageDateMs;
		if (messageAge > MESSAGE_AGE_THRESHOLD) {
			logger.info({ date: ctx.message.date }, "Message is two old, we don't check old messages");
			return;
		}
	} else {
		logger.warn({ ctx }, "No message date in the context");
	}

	if (!ctx.message?.text) {
		logger.debug("No text message to check");
		return;
	}

	const textWithoutDigitsOrPunctuation = stripNonLetterOrWhitespaceChars(ctx.message.text);
	if (textWithoutDigitsOrPunctuation.length < MIN_MSG_LENGTH) {
		logger.debug(
			{ msgLength: textWithoutDigitsOrPunctuation?.length },
			"The message is too short for a check, ignoring",
		);
		return;
	}

	const admins = await chatAdminRepo.getAdminsIds();
	if (admins.includes(ctx.message.from.id)) {
		logger.debug("User is an admin, aborting");
		return;
	}

	const langDaySettings = await langDayService.getDaySettings();
	const language = langDaySettings?.value;
	(ctx as BotContextWithMsgLanguage).language = language;

	const otherLangChecksEnabled = !(await langDayService.isOtherLangChecksDisabled());
	const activeDetector = await langDayService.getDetector();

	// Both detectors classify every message for shadow testing, only the active one is acted upon
	const classifyWith = (name: DetectorName) =>
		classifyMessage(
			logger.child({ detector: name }),
			textWithoutDigitsOrPunctuation,
			language,
			otherLangChecksEnabled,
			detectors[name],
		);
	const [lingua, tongue] = await Promise.allSettled([
		classifyWith(DetectorName.Lingua),
		classifyWith(DetectorName.Tongue),
	]);
	await recordShadowComparison(ctx, { text: textWithoutDigitsOrPunctuation, target: language, activeDetector }, [
		lingua,
		tongue,
	]);

	const active = activeDetector === DetectorName.Lingua ? lingua : tongue;
	if (active.status === "rejected") {
		throw active.reason;
	}
	const { verdict } = active.value;
	if (verdict === "unchecked") {
		return;
	}
	if (verdict === "mixed") {
		logger.info("Seems to be a mixed language message, not issuing a warning");
		return;
	}
	if (verdict === language) {
		logger.debug({ language }, "Correct language, nothing to do here");
		return;
	}
	if (verdict !== "other") {
		logger.info({ msgLang: verdict, language }, "Language mismatch, proceeding with a warning or a general notice");
	}
	(ctx as BotContextWithMsgLanguage).msgLanguage = verdict;

	await next?.();
}

interface Classification {
	verdict: Verdict;
	/** Raw output of the detector calls, for logs */
	raw: { anyLanguage?: OtherLanguageDetection | null; enRu?: LanguageEnum | undefined };
}

/** Runs the language check heuristics on a message with the given detector. */
async function classifyMessage(
	logger: Logger,
	text: string,
	target: LanguageEnum | undefined,
	otherLangChecksEnabled: boolean,
	detector: LanguageDetector,
): Promise<Classification> {
	const raw: Classification["raw"] = {};
	const trackedDetector: LanguageDetector = {
		async detectAnyLanguage(text) {
			raw.anyLanguage = await detector.detectAnyLanguage(text);
			return raw.anyLanguage;
		},
		async detectEnRu(text) {
			raw.enRu = await detector.detectEnRu(text);
			return raw.enRu;
		},
	};

	const otherLanguageDetectionResult = otherLangChecksEnabled
		? await detectLanguageOutsideOfEnRu(
				logger.child({ scope: "lang_day::middleware::other_langs" }),
				text,
				target,
				trackedDetector,
			)
		: undefined;
	if (otherLanguageDetectionResult) {
		logger.info({ msgText: text, otherLanguageDetectionResult, language: target }, "Decided it's a bad language");
		return { verdict: "other", raw };
	}
	if (!target) {
		logger.debug("No specific language is set for the explicit check, aborting");
		return { verdict: "unchecked", raw };
	}
	const msgLang = await trackedDetector.detectEnRu(text);
	logger.debug({ msgLang }, "Language detection result");
	return { verdict: msgLang ?? "mixed", raw };
}

/** Stores lingua vs tongue outcome, when at least one of them was actually called. Never throws. */
async function recordShadowComparison(
	ctx: BotContext,
	{ text, target, activeDetector }: { text: string; target: LanguageEnum | undefined; activeDetector: DetectorName },
	[lingua, tongue]: [PromiseSettledResult<Classification>, PromiseSettledResult<Classification>],
) {
	const logger = ctx.getLogger("lang_day::middleware::shadow");
	if (lingua.status === "rejected" || tongue.status === "rejected") {
		logger.error(
			{ lingua: lingua.status === "rejected" && lingua.reason, tongue: tongue.status === "rejected" && tongue.reason },
			"Language detector failed, skipping the comparison",
		);
		return;
	}
	const detectorsCalled = [lingua.value.raw, tongue.value.raw].some((raw) => Object.keys(raw).length > 0);
	if (!detectorsCalled) return;

	const agreed = lingua.value.verdict === tongue.value.verdict;
	logger[agreed ? "debug" : "info"](
		{ msgText: ctx.message?.text, text, target, activeDetector, lingua: lingua.value, tongue: tongue.value },
		agreed ? "Language detectors agree" : "Language detectors disagree",
	);
	const [, err] = await attempt(() =>
		ctx.container.langDayService.recordShadowComparison({
			target,
			lingua: lingua.value.verdict,
			tongue: tongue.value.verdict,
		}),
	);
	if (err) logger.error({ err }, "Failed to record language detectors comparison");
}
