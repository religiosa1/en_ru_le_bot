import type { BotCommand } from "grammy/types";
import type { BotContext } from "../BotContext.ts";

export type CommandHandler = (ctx: BotContext) => unknown;

// @see https://core.telegram.org/bots/api#botcommand
const botCommandRe = /[a-z0-9_]{1,32}/;
export class Command {
	readonly command: string;
	readonly description: string;
	readonly handler: CommandHandler;

	constructor(name: string, description: string, handler: CommandHandler) {
		if (!botCommandRe.test(name)) {
			throw new TypeError(
				`Bot commands must be up to 32 chars long and contain only lowercase english chars, digits and underscores`,
			);
		}
		this.command = name;
		this.description = description;
		this.handler = handler;
	}

	/**
	 * Transform to tg API json payload
	 * @see https://core.telegram.org/bots/api#botcommand
	 */
	toBotCommand(): BotCommand {
		return { command: this.command, description: this.description };
	}
}

export class AdminOnlyCommand extends Command {
	readonly adminOnly = true;
}

export class HiddenAdminCommand extends AdminOnlyCommand {
	readonly hidden = false;

	constructor(name: string, handler: CommandHandler) {
		super(name, "", handler);
	}
}
