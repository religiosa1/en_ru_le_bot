import { CommandGroup } from "../models/CommandGroup.ts";

export const retranslateCommands = new CommandGroup().addHiddenAdminCommand("rt", async (ctx) => {
	const logger = ctx.getLogger("rt::command");
	logger.info("Retranslate command received");
	const text = ctx.match?.toString();
	if (text) {
		await ctx.api.sendMessage(ctx.container.chatId, text);
	} else {
		logger.info(
			{
				text: ctx.match,
				msgText: ctx.message?.text,
			},
			"Unexpected empty text in rt command",
		);
	}
});
