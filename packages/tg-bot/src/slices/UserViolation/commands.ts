import { CommandGroup } from "../../models/CommandGroup.ts";
import { formatDuration, parseDuration } from "../../utils/duration.ts";
import { toNumber } from "../../utils/toNumber.ts";
import { userViolationService } from "./service.ts";

export const userViolationCommands = new CommandGroup()
	.addAdminCommand("mute", "Toggle mutes on language violations on/off", async (ctx) => {
		const { logger } = ctx;
		const newValue = !userViolationService.getMuteEnabled();
		await userViolationService.setMuteEnabled(newValue);
		logger.info(`Mute capacity modified ${newValue}`);
		await ctx.reply(`Mute on language violations is now ${newValue ? "on" : "off"}`);
	})
	.addAdminCommand("pardon", "[@user] - Remove violations for specific user or all users", async (ctx) => {
		const { logger } = ctx;
		let userName = ctx.match?.toString().trim();

		if (!userName) {
			logger.info("Pardoning all users");
			await userViolationService.pardonAll();
			return;
		}

		if (!userName.startsWith("@")) {
			await ctx.reply("username must start with a `@`, yo");
			return;
		}
		userName = userName.slice(1);
		const pardoned = await userViolationService.pardon(userName);
		if (pardoned) {
			logger.info({ userName }, "Pardoned user");
			await ctx.reply(`Pardoned user @${userName}`);
		} else {
			logger.info({ userName }, "Unable to find violations for the user");
			await ctx.reply(`Unable to find any violations for the @${userName}`);
		}
	})
	.addAdminCommand("mute_duration", "[duration] - Set or view mute duration", async (ctx) => {
		const durationStr = ctx.match?.toString().trim();
		if (!durationStr) {
			const duration = await userViolationService.getMuteDuration();
			await ctx.reply(`Mute duration is ${formatDuration(duration)}`);
			return;
		}
		const { logger } = ctx;
		const duration = parseDuration(durationStr, "m");
		if (Number.isNaN(duration) || duration <= 0) {
			await ctx.reply(`Incorrect duration value "${durationStr}". Try something like "3", "10m", "1m30s", etc.`);
			return;
		}
		await userViolationService.setMuteDuration(duration);
		logger.info({ duration }, "Changing mute duration");
		await ctx.reply(`Mute duration is now ${formatDuration(duration)}`);
	})
	.addAdminCommand("warnings_expiry", "[duration] - Set or view warnings expiration time", async (ctx) => {
		const durationStr = ctx.match?.toString().trim();
		if (!durationStr) {
			const duration = await userViolationService.getWarningsExpiry();
			await ctx.reply(`Warning expiry is ${formatDuration(duration)}`);
			return;
		}
		const { logger } = ctx;
		const duration = parseDuration(durationStr, "m");
		if (Number.isNaN(duration) || duration <= 0) {
			await ctx.reply(`Incorrect expiry value "${durationStr}". Try something like "3", "10m", "1m30s", etc.`);
			return;
		}
		await userViolationService.setWarningsExpiry(duration);
		logger.info({ duration }, "Changing warning expiry");
		await ctx.reply(`Warning expiry is now ${formatDuration(duration)}`);
	})
	.addAdminCommand("warnings_number", "[int] - Set or view number of warnings before mute", async (ctx) => {
		const numStr = ctx.match?.toString().trim();
		if (!numStr) {
			const value = await userViolationService.getMaxViolationNumber();
			await ctx.reply(`Maximum number of warnings is ${value}`);
			return;
		}
		const { logger } = ctx;
		const value = toNumber(numStr);
		if (value == null || !Number.isInteger(value) || value < 0) {
			await ctx.reply(`Maximum number of warnings must be a non-negative integer!`);
			return;
		}
		await userViolationService.setMaxViolationNumber(value);
		logger.info({ maxViolationNumber: value }, "Changing max warnings number");
		await ctx.reply(`Max warnings number is now ${value}`);
	});
