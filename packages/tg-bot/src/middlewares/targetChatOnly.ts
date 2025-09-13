import type { NextFunction } from "grammy";
import type { BotContext } from "../BotContext.ts";

export async function targetChatOnly(ctx: BotContext, next: NextFunction): Promise<void> {
	const { logger } = ctx;
	const { chatId } = ctx.container;
	if (ctx.message?.chat.id !== chatId) {
		logger.debug(
			{ actualChatId: ctx.message?.chat.id, targetChatId: chatId },
			"Wrong chat, we're omitting captcha check",
		);
		return;
	}
	await next();
}
