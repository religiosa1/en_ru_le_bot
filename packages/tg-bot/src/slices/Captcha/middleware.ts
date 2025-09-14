import assert from "node:assert";
import type { NextFunction } from "grammy";
import type { BotContext } from "../../BotContext.ts";
import { getNewUserFromChatMemberEvent } from "../../middlewares/userJoinedTargetChat.ts";
import { raise } from "../../utils/raise.ts";
import { makeQuestionAnswer } from "./makeQuestionAnswer.ts";
import { getCaptchaMessage, getCaptchaSuccessMessage } from "./messages.ts";

const MAX_ATTEMPTS = 7;

export async function captchaMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
	const logger = ctx.getLogger("captcha::middleware");
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

	await ctx.deleteMessage().catch((error) => {
		logger.error({ error }, "Failed to remove non-verified user's message");
	});

	const verificationResult = await captchaService.verifyUserAnswer(userId, text);
	if (verificationResult.correct) {
		logger.info("Captcha verification passed");
		await captchaService.removeUserVerificationCheck(userId);
		await ctx.reply(getCaptchaSuccessMessage(ctx.message.from), {
			parse_mode: "MarkdownV2",
		});
		// we're not calling the next handler, as captcha verification doesn't require any following lang checks
		return;
	}

	logger.info({ text, expectedAnswer: verificationResult.expectedAnswer }, "Captcha verification failed");
	if (verificationResult.attemptsMade >= MAX_ATTEMPTS) {
		logger.info("Too many failed verification attempts, banning them for good.");
		await ctx.api.banChatMember(chatId, userId);
		await captchaService.removeUserVerificationCheck(userId);
	} else if (verificationResult.attemptsMade % 3 === 0) {
		const question = await captchaService.getVerificationQuestion(userId);
		assert(question);
		const allowedTime = await captchaService.getMaxVerificationAge();
		const msg = await ctx.reply(getCaptchaMessage(question, ctx.message.from, allowedTime), {
			parse_mode: "MarkdownV2",
		});
		await captchaService.addUserVerificationMsg(userId, msg.message_id);
	}
}

export async function onChatMemberCaptchaHandler(ctx: BotContext): Promise<void> {
	const logger = ctx.getLogger("captcha::new_chat_member_handler");
	const { captchaService, chatId } = ctx.container;

	const user = getNewUserFromChatMemberEvent(ctx) ?? raise("User must be present for captcha handler to work");

	logger.info({ user }, "New member joined");

	if (!(await captchaService.getEnabled())) {
		return;
	}

	if (user.is_bot) {
		logger.info({ user }, "New joined user is a bot");
		const areBotsAllowed = await captchaService.getBotsAllowed();
		if (!areBotsAllowed) {
			await ctx.api.banChatMember(chatId, user.id);
		}
	} else {
		const [question, answer] = makeQuestionAnswer();
		const allowedTime = await captchaService.getMaxVerificationAge();
		const msg = await ctx.reply(getCaptchaMessage(question, user, allowedTime), { parse_mode: "MarkdownV2" });
		logger.info({ user }, "Sent captcha check for the user");
		await captchaService.addUserVerificationCheck({
			userId: user.id,
			userName: user.username,
			question: question,
			answer: answer,
			msgId: msg.message_id,
		});
	}
}
