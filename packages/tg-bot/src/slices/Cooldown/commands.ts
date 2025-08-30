import { CommandGroup } from "@grammyjs/commands";
import { adminScope } from "../../adminScope.ts";
import { formatDuration, parseDuration } from "../../utils/duration.ts";
import { cooldownService } from "./service.ts";

/**
 * Cooldown slice manages interval between wrong language warnings, so bot
 * doesn't spam with repeated warnings on every message.
 */
export const cooldownCommands = new CommandGroup();

cooldownCommands
	.command("cooldown", "Set cooldown value for wrong language warnings")
	.addToScope(adminScope, async (ctx) => {
		const [, durationStr] = ctx.message?.text?.trim().split(/\s+/, 2) ?? [];
		if (!durationStr) {
			cooldownService.setCooldownValue(cooldownService.defaultCooldown);
			await ctx.reply(`Setting cooldown to the default value of ${formatDuration(cooldownService.defaultCooldown)}`);
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
		cooldownService.setCooldownValue(cooldown);
		await ctx.reply(`Cooldown between warnings is now ${formatDuration(cooldown)}`);
	});
