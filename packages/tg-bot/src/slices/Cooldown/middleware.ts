import type { NextFunction } from "grammy";
import type { BotContext } from "../../BotContext.ts";

/** Cooldown middleware. Will abort the next middleware in the chain, if we're still in cooldown */
export async function cooldownMiddleware(ctx: BotContext, next?: NextFunction) {
	const { logger } = ctx;
	const { cooldownService } = ctx.container;

	if (cooldownService.isCoolingDown()) {
		logger.info(
			{
				cooldownUntil: cooldownService.getCooldownEndTs(),
			},
			"Still cooling down, aborting.",
		);
		return;
	}
	await cooldownService.activateCooldown();
	await next?.();
}
