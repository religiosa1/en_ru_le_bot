import { CommandGroup } from "../../models/CommandGroup.ts";
import { attempt } from "../../utils/attempt.ts";
import { formatDuration, parseDuration } from "../../utils/duration.ts";
import { parseUsername } from "../../utils/parseUsername.ts";

export const captchaCommands = new CommandGroup()
	.addAdminCommand("trust", "@username remove captcha check for a user", async (ctx) => {
		const [userName, error] = attempt(() => parseUsername(ctx.match));
		if (error != null) {
			ctx.reply(String(error));
			return;
		}
		if (!userName) {
			ctx.reply("username is required in this command");
			return;
		}
		const { logger } = ctx;
		const { captchaService } = ctx.container;
		await captchaService.removeUserVerificationCheck(userName);
		logger.info({ userName }, "Trusted user");
		await ctx.reply(`Ok, user @${userName} is now trusted`);
	})
	.addAdminCommand("captcha", "toggle captcha check for newcomers on/off", async (ctx) => {
		const { logger } = ctx;
		const { captchaService } = ctx.container;
		const enabled = await captchaService.toggleEnabled();
		logger.info({ enabled }, "Toggle captcha");
		await ctx.reply(`Captcha checks for newComers are now ${enabled ? "on" : "off"}`);
	})
	.addAdminCommand(
		"captcha_time",
		"[duration] show or set time in which members must pass captcha check",
		async (ctx) => {
			const { logger } = ctx;
			const { captchaService } = ctx.container;
			const durationStr = ctx.match?.toString();
			if (!durationStr) {
				const durationValue = await captchaService.getMaxVerificationAge();
				await ctx.reply(`Captcha max verification time: ${formatDuration(durationValue)}`);
				return;
			}
			const durationValue = parseDuration(durationStr, "m");
			if (Number.isNaN(durationValue)) {
				await ctx.reply(`Wrong captcha time value: "${durationStr}". Try something like "3", "10m", "1m30s", etc.`);
				return;
			}
			await captchaService.setMaxVerificationAge(durationValue);
			logger.info({ maxVerificationAge: durationValue }, "Captcha maxVerificationAge changed");
			await ctx.reply(`Captcha verification time is now ${formatDuration(durationValue)}`);
		},
	)
	.addAdminCommand("captcha_bots", "toggle bots allowed on/off", async (ctx) => {
		const { logger } = ctx;
		const { captchaService } = ctx.container;
		const value = await captchaService.toggleBotsAllowed();
		logger.info({ value }, "Bots allowed toggled ");
	});
