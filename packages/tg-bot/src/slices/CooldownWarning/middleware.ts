import type { NextFunction } from "grammy";
import type { BotContext } from "../../BotContext.ts";
import { isBotContextWithMsgLanguage } from "../../models/BotContextWithMsgLanguage.ts";
import { getWarningMessage } from "../../utils/getWarningMessage.ts";
import { cooldownWarningService } from "./service.ts";

export async function cooldownWarningMiddleware(ctx: BotContext, next?: NextFunction) {
	if (!isBotContextWithMsgLanguage(ctx)) {
		throw new Error("cooldown middleware must be used on bot context with message language");
	}
	const { logger, language } = ctx;

	if (cooldownWarningService.isCoolingDown()) {
		logger.info(
			{
				cooldownUntil: cooldownWarningService.getCooldownEndTime(),
			},
			"Don't send a general note on mismatched language, as we're still cooling down",
		);
		return;
	} else {
		logger.info("Sending a general note on language usage");
		cooldownWarningService.activateCooldown();
		await ctx.reply(getWarningMessage(language));
	}
	await next?.();
}
