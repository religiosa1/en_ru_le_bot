import type { NextFunction } from "grammy";
import type { BotContext } from "../../BotContext.ts";

export async function adminOnly(ctx: BotContext, next: NextFunction): Promise<void> {
	const { logger } = ctx;
	const admins = await ctx.container.chatAdminRepo.getAdminsIds();
	const userId = ctx.message?.from.id;
	if (!userId || !admins.includes(userId)) {
		logger.info({ admins }, "User not authorized to perform this request");

		const isInTheChat = ctx.chatId === ctx.container.chatId;
		if (isInTheChat) {
			const username = ctx.message?.from.username;
			await ctx.reply(
				`${username ? `@${username} ` : ""}You're not allowed to do that!`,
				ctx.msgId
					? {
							reply_parameters: {
								message_id: ctx.msgId,
							},
						}
					: undefined,
			);
		} else {
			await ctx.reply("You're not allowed to do that!");
		}
		return;
	}
	await next();
}
