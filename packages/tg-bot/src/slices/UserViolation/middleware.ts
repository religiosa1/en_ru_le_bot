import type { NextFunction } from "grammy";
import { match } from "ts-pattern";
import type { BotContext } from "../../BotContext.ts";
import { LanguageEnum } from "../../enums/Language.ts";
import { Time } from "../../enums/Time.ts";
import { isBotContextWithMsgLanguage } from "../../models/BotContextWithMsgLanguage.ts";
import { assertNever } from "../../utils/assertNever.ts";

/**
 * Middleware that kicks in, when there's a language violation.
 * It either gives user a warning, or mutes him, if he has too much warnings already.
 *
 * If mute functionality is disabled, we still give user a warning, but don't increase
 * the violation counter (so it can expire away on its own, or be back in action, when
 * mute is turned back on).
 *
 * - Why are warnings language in reverse? In Russian on English day and vice versa.
 * - Failsafe if a user can't understand the other language. For example, they write
 *   in English, they get a warning in English as well, in case they can't read Russian at all.
 */
export async function userViolationMiddleware(ctx: BotContext, next?: NextFunction) {
	if (!isBotContextWithMsgLanguage(ctx)) {
		throw new Error("user violation middleware must be used on bot context with message language");
	}
	if (!ctx.message) {
		throw new Error("Message is not present in the context");
	}
	const userViolationService = ctx.container.userViolationService;
	const { logger, language } = ctx;
	const { chatId } = ctx.container;

	const userId = ctx.message.from.id;

	const replyParams = {
		reply_parameters: {
			message_id: ctx.message.message_id,
		},
	};

	if (!(await userViolationService.getMuteEnabled())) {
		await ctx.reply(getWarningMessage(language), replyParams);
		return;
	}

	const violationStats = await userViolationService.registerViolation(userId, ctx.message.from.username);
	const warningsLeft = violationStats.maxViolations - violationStats.value;

	if (warningsLeft > 0) {
		await ctx.reply(
			[getWarningMessage(language), geViolationWarningMessage(language, violationStats.value, warningsLeft)].join(
				"\n\n",
			),
			replyParams,
		);
		return;
	}
	try {
		const muteDuration = await userViolationService.getMuteDuration();
		await ctx.api.restrictChatMember(
			chatId,
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
		await ctx.reply(
			language === LanguageEnum.English
				? "Ты временно замьючен за неоднократные нарушения"
				: "You're temporarily muted for a repeated violation.",
			replyParams,
		);
	} catch (err) {
		logger.error({ err, userId }, "Error while restricting a member");
		ctx.reply(
			language === LanguageEnum.English
				? "Ничего, в следующий раз тебя ещё достану"
				: "You're in luck, pal. I'll get to you next time",
			replyParams,
		);
	}
	await next?.();
}

export function getWarningMessage(language: LanguageEnum): string {
	switch (language) {
		case LanguageEnum.English:
			return `Эй, сегодня день английского. Пытайся говорить на английском!`;
		case LanguageEnum.Russian:
			return `Hey, today is a Russian day. Try to speak Russian!`;
		default:
			assertNever(language, `Unsupported language code value: ${language}`);
	}
}

function geViolationWarningMessage(language: LanguageEnum, nWarnings: number, warningsLeft: number): string {
	return match(language)
		.with(LanguageEnum.English, () =>
			warningsLeft === 1 ? `Это последнее предупреждение` : `Это ${nWarnings}-e предупреждение.`,
		)
		.with(LanguageEnum.Russian, () =>
			warningsLeft === 1 ? `This is your last warning` : `This is your ${ordinalEn(nWarnings)} warning`,
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
