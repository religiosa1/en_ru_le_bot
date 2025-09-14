import { CommandGroup } from "../../models/CommandGroup.ts";

export const chatAdminCommands = new CommandGroup().addHiddenAdminCommand("flush_admins", async (ctx) => {
	const logger = ctx.getLogger("chat_admins::command::flush_admins");
	const { chatAdminRepo } = ctx.container;
	logger.info("Manual refresh of the admin list");
	await chatAdminRepo.refreshAdminsList();
	await ctx.reply("List of admins refreshed");
});
