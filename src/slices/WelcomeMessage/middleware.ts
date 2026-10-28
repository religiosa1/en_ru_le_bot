import type { NextFunction } from "grammy";
import type { BotContext } from "../../BotContext.ts";

export async function registerMessageBetweenWelcomes(ctx: BotContext, next: NextFunction): Promise<void> {
	ctx.container.welcomeService.registerMessage();
	await next();
}
