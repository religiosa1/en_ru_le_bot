import type { BotContext } from "../BotContext.ts";
import { CommandGroup } from "../models/CommandGroup.ts";

import { alarmCommands } from "./Alarm/commands.ts";
import { chatAdminCommands } from "./ChatAdmins/commands.ts";
import { cooldownCommands } from "./Cooldown/commands.ts";
import { langDayCommands } from "./LangDay/commands.ts";
import { retranslateCommands } from "./retranslateCommands.ts";
import { rulesCommand } from "./rulesCommand.ts";
import { userViolationCommands } from "./UserViolation/commands.ts";

export const allCommands = CommandGroup.merge(
	alarmCommands,
	chatAdminCommands,
	langDayCommands,
	userViolationCommands,
	cooldownCommands,
	retranslateCommands,
	rulesCommand,
).addCommand("help", '["members"] display help on bot commands', async (ctx: BotContext) => {
	const { chatAdminRepo } = ctx.container;
	const omitAdminSection = ctx.match === "members";

	let msg = "";
	for (const command of allCommands.getMembersCommandGroup()) {
		msg += `- /${command.command} ${command.description}\n`;
	}

	const adminsList = await chatAdminRepo.getAdminsIds();
	const isAdmin = !!ctx.message && adminsList.includes(ctx.message?.from.id);
	if (!omitAdminSection && isAdmin) {
		for (const command of allCommands.getAdminsCommandGroup()) {
			msg += `- /${command.command} ${command.description} (admin-only)\n`;
		}
	}
	await ctx.reply(msg);
});
