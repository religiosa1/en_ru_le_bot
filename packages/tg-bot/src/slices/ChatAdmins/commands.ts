import { CommandGroup } from "../../models/CommandGroup.ts";

export const chatAdminCommands = new CommandGroup().addHiddenAdminCommand("flush_admins", async (ctx) => {
	const { logger } = ctx;
	const { chatAdminRepo } = ctx.container;
	logger.info("Manual refresh of the admin list");
	await chatAdminRepo.refreshAdminsList();
	await ctx.reply("List of admins refreshed");
});
