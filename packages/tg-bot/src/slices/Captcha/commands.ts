import { CommandGroup } from "../../models/CommandGroup.ts";
import { attempt } from "../../utils/attempt.ts";
import { formatDuration, parseDuration } from "../../utils/duration.ts";
import { getUserMentionFromMatchCtx } from "../../utils/parseUsername.ts";
import { formatUser, isUser } from "../../utils/userUtils.ts";
import { makeQuestionAnswer } from "./makeQuestionAnswer.ts";
import { getCaptchaMessage, getCaptchaSuccessMessage } from "./messages.ts";

const scope = (name: string) => `captcha::command::${name}`;

export const captchaCommands = new CommandGroup()
	.addAdminCommand("trust", "@username remove captcha check for a user", async (ctx) => {
		const [user, error] = attempt(() => getUserMentionFromMatchCtx(ctx));
		if (error != null) {
			ctx.reply(String(error));
			return;
		}
		if (!user) {
			ctx.reply("username is required in this command");
			return;
		}
		const logger = ctx.getLogger(scope("trust"));
		const { captchaService } = ctx.container;
		await captchaService.removeUserVerificationCheck(isUser(user) ? user.id : user);
		logger.info({ userName: user }, "Trusted user");
		await ctx.reply(`Ok, user @${formatUser(user)} is now trusted`);
	})
	.addAdminCommand("captcha", "toggle captcha check for newcomers on/off", async (ctx) => {
		const logger = ctx.getLogger(scope("captcha"));
		const { captchaService } = ctx.container;
		const enabled = await captchaService.toggleEnabled();
		logger.info({ enabled }, "Toggle captcha");
		await ctx.reply(`Captcha checks for newComers are now ${enabled ? "on" : "off"}`);
	})
	.addAdminCommand(
		"captcha_time",
		"[duration] show or set time in which members must pass captcha check",
		async (ctx) => {
			const logger = ctx.getLogger(scope("captcha_time"));
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
		const logger = ctx.getLogger(scope("captcha_bots"));
		const { captchaService } = ctx.container;
		const value = await captchaService.toggleBotsAllowed();
		logger.info({ value }, "Bots allowed toggled ");
		await ctx.reply(value ? "Bots can join now" : "Bots are forbidden to join now");
	})
	// hidden command for testing captcha messages (as formatting can be tricky)
	.addHiddenAdminCommand("captcha_msg", async (ctx) => {
		const [question] = makeQuestionAnswer();
		const { captchaService } = ctx.container;
		if (!ctx.from) return;
		const captchaMsg = getCaptchaMessage(question, ctx.from, await captchaService.getMaxVerificationAge());
		await ctx.reply(captchaMsg, { parse_mode: "MarkdownV2" });
		const successMsg = getCaptchaSuccessMessage(ctx.from);
		await ctx.reply(successMsg, { parse_mode: "MarkdownV2" });
	})
	// Hidden command to nuke captcha storage
	.addHiddenAdminCommand("captcha_clear", async (ctx) => {
		const logger = ctx.getLogger(scope("captcha_clear"));
		const { captchaService } = ctx.container;
		await captchaService.clearAllVerifications();
		logger.info("Cleared all captcha verifications");
		await ctx.reply(`Removed all pending captcha checks`);
	});
