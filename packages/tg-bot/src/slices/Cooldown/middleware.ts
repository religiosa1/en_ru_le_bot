import type { NextFunction } from "grammy";
import type { BotContext } from "../../BotContext.ts";
import { cooldownService } from "./service.ts";

/** Cooldown middleware. Will abort the next middleware in the chain, if we're still in cooldown */
export async function cooldownMiddleware(ctx: BotContext, next?: NextFunction) {
	const { logger } = ctx;

	if (cooldownService.isCoolingDown()) {
		logger.info(
			{
				cooldownUntil: cooldownService.getCooldownEndTime(),
			},
			"Still cooling down, aborting.",
		);
		return;
	}
	cooldownService.activateCooldown();
	await next?.();
}
