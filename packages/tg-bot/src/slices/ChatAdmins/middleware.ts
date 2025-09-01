import type { NextFunction } from "grammy";
import type { BotContext } from "../../BotContext.ts";

export async function adminOnly(ctx: BotContext, next: NextFunction): Promise<void> {
	const { logger } = ctx;
	const admins = await ctx.container.chatAdminRepo.getAdminsIds();
	const userId = ctx.message?.from.id;
	if (!userId || !admins.includes(userId)) {
		logger.info({ admins }, "User not authorized to perform this request");
		await ctx.reply("You're not allowed to do that!");
		return;
	}
	await next();
}
