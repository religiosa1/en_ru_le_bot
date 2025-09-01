import * as langDetection from "@en-ru-le/language-detection";
import type { NextFunction } from "grammy";
import { match } from "ts-pattern";
import type { BotContext } from "../../BotContext.ts";
import { LanguageEnum } from "../../enums/Language.ts";
import { Time } from "../../enums/Time.ts";
import type { BotContextWithMsgLanguage } from "../../models/BotContextWithMsgLanguage.ts";
import { langDayService } from "./service.ts";

const MIN_MSG_LENGTH = 15;

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
	const { logger } = ctx;
	logger.debug(
		{
			chatId: ctx.message?.chat.id,
			from: ctx.message?.from?.username,
			text: ctx.message?.text,
		},
		"Message received",
	);
	if (ctx.message?.chat.id !== ctx.targetChatId) {
		logger.info(
			{ chatId: ctx.message?.chat.id, targetChatId: ctx.targetChatId, text: ctx.message?.text },
			"mismatched chat id, ignoring the message",
		);
		return;
	}
	if (ctx.message.date && Date.now() - ctx.message.date > MESSAGE_AGE_THRESHOLD) {
		logger.info({ date: ctx.message.date }, "Message is two old, we don't check old messages");
		return;
	}
	if (!ctx.message?.text || ctx.message.text.length < MIN_MSG_LENGTH) {
		logger.debug({ msgLength: ctx.message?.text?.length }, "The message is too short for a check, ignoring");
		return;
	}
	const admins = await ctx.chatAdminRepo.getAdminsIds();
	if (admins.includes(ctx.message.from.id)) {
		logger.debug("User is an admin, aborting");
		return;
	}

	const language = langDayService.getDaySettings()?.value;
	if (!language) {
		logger.debug({ language }, "No specific language is set, aborting");
		return;
	}

	const msgLanguages = await langDetection.isRussianOrEnglish(ctx.message.text);
	logger.debug({ msgLanguages }, "Language detection result");

	const msgLang = determineMainLanguage(msgLanguages);

	if (msgLang == null) {
		logger.info({ msgLanguages }, "Seems to be a mixed language message, not issuing a warning");
		return;
	} else if (msgLang === language) {
		logger.debug({ language }, "Correct language, nothing to do here");
		return;
	} else {
		logger.info({ msgLang, language }, "Language mismatch, proceeding with a warning or a general notice");
	}

	(ctx as BotContextWithMsgLanguage).language = language;
	(ctx as BotContextWithMsgLanguage).msgLanguage = msgLang;

	await next?.();
}

/** Rate of one language over the other, when we start considering "it's written in language A"! */
const REQUIRED_LANGUAGE_RATE = 1.7;

function determineMainLanguage(languages: langDetection.DetectedLanguage[]): LanguageEnum | undefined {
	const fragsByLang = Object.groupBy(languages, (i) => {
		if (!isLangEnumValue(i.language)) {
			throw new Error(`Unexpected language in the detection result: ${i.language}`);
		}
		return i.language;
	});

	const nLangs = Object.keys(fragsByLang).length;

	if (nLangs === 0) return undefined;
	if (nLangs === 1) return Object.keys(fragsByLang)[0] as LanguageEnum;

	// If we have both languages in the message, there must be more of one lang over the other
	// for us to say "it's in the language foo"! Otherwise, we should consider it a text written in
	// both languages, and we shouldn't give a warning for a text like that.

	const lengthByLanguage: Partial<Record<LanguageEnum, number>> = Object.fromEntries(
		Object.entries(fragsByLang).map(([key, value]) => [
			key,
			value.reduce((acc, cur) => acc + cur.endIndex - cur.startIndex, 0),
		]),
	);

	const ruLen = lengthByLanguage.ru;
	const enLen = lengthByLanguage.en;

	if (!ruLen && !enLen) return undefined;
	if (!ruLen) return LanguageEnum.English;
	if (!enLen) return LanguageEnum.Russian;

	const ruToEnRate = ruLen / enLen;

	return match(ruToEnRate)
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

function isLangEnumValue(v: unknown): v is LanguageEnum {
	return (Object.values(LanguageEnum) as unknown[]).includes(v);
}
