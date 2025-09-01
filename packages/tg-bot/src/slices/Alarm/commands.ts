import { CommandGroup } from "../../models/CommandGroup.ts";

export const alarmCommands = new CommandGroup().addAdminCommand(
	"alarm",
	"Toggle notifications about day change on/off",
	async (ctx) => {
		const { logger } = ctx;
		const { alarmService } = ctx.container;

		const newValue = !alarmService.isEnabled;
		alarmService.setEnabled(newValue);
		logger.info(`Day change notifications set to ${newValue}`);
		await ctx.reply(`Day change notifications are now ${newValue ? "on" : "off"}`);
	},
);
