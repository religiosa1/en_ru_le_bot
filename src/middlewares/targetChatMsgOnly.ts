import type { NextFunction } from "grammy";
import type { BotContext } from "../BotContext.ts";

export async function targetChatMsgOnly(ctx: BotContext, next: NextFunction): Promise<void> {
	const logger = ctx.getLogger("targetChatMsgOnly");
	const { chatId } = ctx.container;
	const currentChatId = ctx.message?.chat.id;
	if (currentChatId !== chatId) {
		logger.debug(
			{ actualChatId: currentChatId, targetChatId: chatId },
			`Wrong chat, aborting following checks in middleware`,
		);
		return;
	}
	await next();
}
