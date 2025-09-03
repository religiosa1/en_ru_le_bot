import { CommandGroup } from "../../models/CommandGroup.ts";
import { attempt } from "../../utils/attempt.ts";
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
	});
