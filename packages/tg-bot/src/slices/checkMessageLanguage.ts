import * as langDetection from "@en-ru-le/language-detection";
import type { Context } from "grammy";
import { LanguageEnum } from "../enums/Language.ts";
import { logger as baseLogger } from "../logger.ts";
import { getConfig } from "../models/config.ts";
import { assertNever } from "../utils/assertNever.ts";
import { cooldownService } from "./Cooldown/service.ts";
import { langDayService } from "./LangDay/service.ts";

const MIN_MSG_LENGTH = 50;

export async function checkMessageLanguage(ctx: Context) {
	const logger = baseLogger.child({ messageId: ctx.message?.message_id });
	logger.trace(
		{
			chatId: ctx.message?.chat.id,
			from: ctx.message?.from.username,
			text: ctx.message?.text,
		},
		"Message received",
	);
	if (ctx.message?.chat.id !== getConfig().chatId) {
		logger.info(
			{ chatId: ctx.message?.chat.id, configChatId: getConfig().chatId },
			"mismatched chat id, ignoring the message",
		);
		return;
	}
	if (!ctx.message?.text || ctx.message.text.length < MIN_MSG_LENGTH) {
		logger.trace({ msgLength: ctx.message?.text?.length }, "The message is too short for a check, ignoring");
		return;
	}

	const language = langDayService.getDaySettings()?.value;
	if (!language) {
		logger.trace({ language }, "No specific language is selected, aborting");
		return;
	}

	const msgLanguages = await langDetection.isRussianOrEnglish(ctx.message.text);
	const msgLang = determineMainLanguage(msgLanguages) as LanguageEnum;
	if (!Object.values(LanguageEnum).includes(msgLang)) {
		throw new Error(
			`Unexpected language code ${msgLang}, must be one of ${JSON.stringify(Object.values(LanguageEnum))}`,
		);
	}

	if (msgLang === language) {
		logger.trace({ language }, "Correct language, nothing to do here");
		return;
	} else {
		logger.info({ msgLang, language }, "Language mismatch, proceeding with a warning or a general notice");
	}

	// TODO warn and ban functionality per user.
	// This must be in a else branch, if mute functionality is disabled, so we're in toothless mode.

	if (cooldownService.isCoolingDown()) {
		logger.info(
			{
				cooldownUntil: cooldownService.getCooldownEndTime(),
			},
			"Don't send a general note on mismatched language, as we're still cooling down",
		);
		return;
	} else {
		logger.info("Sending ");
		await ctx.reply(getWarningMessage(language));
	}
}

function getWarningMessage(language: LanguageEnum): string {
	switch (language) {
		case LanguageEnum.English:
			return `Hey, today is a Russian day. Try to speak Russian!`;
		case LanguageEnum.Russian:
			return `Эй, сегодня день английского. Пытайся говорить на английском!`;
		default:
			assertNever(language, `Unsupported language code value: ${language}`);
	}
}

function determineMainLanguage(languages: langDetection.NapiDetectedLanguage[]): string {
	return languages.reduce((a, b) => (a.wordCount > b.wordCount ? a : b)).language;
}
