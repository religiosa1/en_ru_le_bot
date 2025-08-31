import { CommandGroup } from "../../models/CommandGroup.ts";

export const chatAdminCommands = new CommandGroup().addAdminCommand(
	"flush",
	"refresh admin list from server",
	async (ctx) => {
		const { logger, chatAdminRepo } = ctx;
		logger.info("Manual refresh of the admin list");
		await chatAdminRepo.refreshAdminsList();
		await ctx.reply("List of admins refreshed");
	},
);
