import type { BotCommand } from "grammy/types";
import type { BotContext } from "../BotContext.ts";

export type CommandHandler = (ctx: BotContext) => unknown;

export class Command {
	readonly command: string;
	readonly description: string;
	readonly handler: CommandHandler;

	constructor(name: string, description: string, handler: CommandHandler) {
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
