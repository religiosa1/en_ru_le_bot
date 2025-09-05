import assert from "node:assert";
import type { NextFunction } from "grammy";
import type { User } from "grammy/types";
import { dedent as d } from "ts-dedent";
import type { BotContext } from "../../BotContext.ts";
import { makeQuestionAnswer } from "./makeQuestionAnswer.ts";

const MAX_ATTEMPTS = 7;

export async function captchaMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
	const { logger } = ctx;
	const { captchaService, chatId } = ctx.container;

	const userId = ctx.message?.from.id;

	if (
		!userId ||
		ctx.message?.chat.id !== chatId ||
		!(await captchaService.getEnabled()) ||
		!(await captchaService.getUserNeedsVerification(userId))
	) {
		return await next();
	}

	const text = ctx.message.text ?? "";
	const verificationResult = await captchaService.verifyUserAnswer(userId, text);
	if (verificationResult.correct) {
		logger.info("Captcha verification passed");
		await captchaService.removeUserVerificationCheck(userId);
		return await next();
	}

	logger.info({ text, expectedAnswer: verificationResult.expectedAnswer }, "Captcha verification failed");
	await ctx.deleteMessage().catch((error) => {
		logger.error({ error }, "Failed to remove non-verified user's message");
	});
	if (verificationResult.attemptsMade >= MAX_ATTEMPTS) {
		logger.info("Too many failed verification attempts, banning them for good.");
		await ctx.banChatMember(userId);
		await captchaService.removeUserVerificationCheck(userId);
	} else if (verificationResult.attemptsMade % 3 === 0) {
		const question = await captchaService.getVerificationQuestion(userId);
		assert(question);
		const msg = await ctx.reply(getCaptchaMessage(question, ctx.message.from), { parse_mode: "MarkdownV2" });
		await captchaService.addUserVerificationMsg(userId, msg.message_id);
	}
}

export async function onChatMemberHandler(ctx: BotContext): Promise<void> {
	const { logger } = ctx;
	const { captchaService, chatId } = ctx.container;

	if (ctx.message?.chat.id !== chatId) {
		logger.debug(
			{ actualChatId: ctx.message?.chat.id, targetChatId: chatId },
			"Wrong chat, we're omitting captcha check",
		);
	}

	const user = getNewUserFromChatMemberEvent(ctx);
	if (!user) {
		return;
	}

	logger.info({ user }, "New member joined");

	if (!(await captchaService.getEnabled())) {
		return;
	}

	if (user.is_bot) {
		logger.info({ user }, "New joined user is a bot");
		const areBotsAllowed = await captchaService.getBotsAllowed();
		if (!areBotsAllowed) {
			await ctx.banChatMember(user.id);
		}
	} else {
		const [question, answer] = makeQuestionAnswer();
		const msg = await ctx.reply(getCaptchaMessage(question, user), { parse_mode: "MarkdownV2" });
		await captchaService.addUserVerificationCheck({
			userId: user.id,
			userName: user.username,
			question: question,
			answer: answer,
			msgId: msg.message_id,
		});
	}
}

/** Analyzes chat_member event and tries to determine, if it's a new user joined */
function getNewUserFromChatMemberEvent(ctx: BotContext): User | undefined {
	const member = ctx.update.chat_member?.new_chat_member;
	const oldMember = ctx.update.chat_member?.old_chat_member;
	if (!member || member.status !== "member" || (oldMember != null && oldMember.status !== "left")) {
		return;
	}
	return member.user;
}

function getCaptchaMessage(question: string, member: User): string {
	const mention = `[@${escapeMdValue(member.username || member.first_name)}](tg://user?id=${member.id})`;

	return d`
  ${escapeMdValue(question)}

  ${mention}, please, send the solution to the arithmetic operation provided. Thank you!

  ${mention}, пожалуйста, напиши сумму чисел в примере. Спасибо!`;
}

function escapeMdValue(input: string): string {
	return input.replaceAll(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
