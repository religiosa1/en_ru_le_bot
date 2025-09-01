import type { NextFunction } from "grammy";
import { match } from "ts-pattern";
import type { BotContext } from "../../BotContext.ts";
import { LanguageEnum } from "../../enums/Language.ts";
import { Time } from "../../enums/Time.ts";
import { isBotContextWithMsgLanguage } from "../../models/BotContextWithMsgLanguage.ts";
import { getWarningMessage } from "../../utils/getWarningMessage.ts";
import { userViolationService } from "./service.ts";

/**
 * Middleware that kicks in, when there's a language violation.
 * It either gives user a warning, or mutes him, if he has too much warnings already.
 *
 * It doesn't pass the execution down the middleware chain, unless it's disabled.
 */
export async function userViolationMiddleware(ctx: BotContext, next?: NextFunction) {
	if (!isBotContextWithMsgLanguage(ctx)) {
		throw new Error("user violation middleware must be used on bot context with message language");
	}
	if (!ctx.message) {
		throw new Error("Message is not present in the context");
	}
	if (!(await userViolationService.getMuteEnabled())) {
		return await next?.();
	}

	const { logger, language } = ctx;
	const userId = ctx.message.from.id;
	const violationStats = await userViolationService.registerViolation(userId, ctx.message.from.username);

	const warningsLeft = violationStats.maxViolations - violationStats.value;
	if (warningsLeft > 0) {
		await ctx.reply(
			[getWarningMessage(language), geViolationWarningMessage(language, violationStats.value, warningsLeft)].join(
				"\n\n",
			),
		);
		return;
	}
	try {
		const muteDuration = await userViolationService.getMuteDuration();
		await ctx.api.restrictChatMember(
			ctx.targetChatId,
			userId,
			{
				can_send_messages: false,
				can_send_audios: false,
				can_send_documents: false,
				can_send_photos: false,
				can_send_videos: false,
				can_send_video_notes: false,
				can_send_voice_notes: false,
				can_send_polls: false,
				can_send_other_messages: false,
			},
			{
				until_date: (Date.now() + muteDuration) / Time.Seconds,
			},
		);
	} catch (err) {
		logger.error({ err, userId }, "Error while restricting a member");
		ctx.reply(
			language === LanguageEnum.English
				? "You're in luck, pal. I'll get to you next time"
				: "Ничего, в следующий раз тебя ещё достану",
		);
	}
}

function geViolationWarningMessage(language: LanguageEnum, nWarnings: number, warningsLeft: number): string {
	return match(language)
		.with(LanguageEnum.English, () =>
			warningsLeft === 1 ? `This is your last warning` : `This is your ${ordinalEn(nWarnings)} warning`,
		)
		.with(LanguageEnum.Russian, () =>
			warningsLeft === 1 ? `Это последнее предупреждение` : `Это ${nWarnings}-e предупреждение.`,
		)
		.exhaustive();
}

function ordinalEn(num: number): string {
	num = Math.floor(num);
	const lastTwoDigits = num % 100;
	const lastDigit = num % 10;

	if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
		return num + "th";
	}

	switch (lastDigit) {
		case 1:
			return num + "st";
		case 2:
			return num + "nd";
		case 3:
			return num + "rd";
		default:
			return num + "th";
	}
}
