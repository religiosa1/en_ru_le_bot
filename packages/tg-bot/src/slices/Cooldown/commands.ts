import { CommandGroup } from "../../models/CommandGroup.ts";
import { formatDuration, parseDuration } from "../../utils/duration.ts";

/**
 * Cooldown slice throttles how often next middleware will run.
 */
export const cooldownCommands = new CommandGroup().addAdminCommand(
	"cooldown",
	"[duration] Set cooldown value for wrong language warnings",
	async (ctx) => {
		const { logger } = ctx;
		const { cooldownService } = ctx.container;
		const durationStr = ctx.match?.toString();
		if (!durationStr) {
			const val = await cooldownService.reset();
			logger.info("cooldown reset to default values");
			await ctx.reply(`Setting cooldown to the default value of ${formatDuration(val)}`);
			return;
		}

		const cooldown = parseDuration(durationStr, "m");
		if (Number.isNaN(cooldown)) {
			await ctx.reply(`Wrong cooldown duration value: "${durationStr}". Try something like "3", "10m", "1m30s", etc.`);
			return;
		}
		if (cooldown < 0 || cooldown > cooldownService.maxCooldown) {
			await ctx.reply(`Cooldown must be in range between 0 and ${formatDuration(cooldownService.maxCooldown)}`);
			return;
		}
		await cooldownService.setCooldownValue(cooldown);
		logger.info({ cooldown }, `cooldown modified to be ${formatDuration(cooldown)}`);
		await ctx.reply(`Cooldown between warnings is now ${formatDuration(cooldown)}`);
	},
);
