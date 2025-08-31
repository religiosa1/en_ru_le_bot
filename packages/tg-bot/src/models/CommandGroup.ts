import type { BotCommand } from "grammy/types";
import { AdminOnlyCommand, Command, type CommandHandler } from "./Command.ts";

export class CommandGroup {
	static merge(...groups: CommandGroup[]): CommandGroup {
		return new CommandGroup(groups.flatMap((i) => i.#commands));
	}

	merge(...groups: CommandGroup[]): CommandGroup {
		return CommandGroup.merge(this, ...groups);
	}

	#commands: Command[] = [];

	constructor(commands: Command[] = []) {
		this.#commands = commands;
	}

	addCommand(name: string, description: string, handler: CommandHandler): CommandGroup {
		this.#commands.push(new Command(name, description, handler));
		return this;
	}

	addAdminCommand(name: string, description: string, handler: CommandHandler): CommandGroup {
		this.#commands.push(new AdminOnlyCommand(name, description, handler));
		return this;
	}

	getAllUserCommandGroup(): CommandGroup {
		return new CommandGroup(this.#commands.filter((i) => !(i instanceof AdminOnlyCommand)));
	}

	getAllAdminCommandGroup(): CommandGroup {
		return new CommandGroup(this.#commands.filter((i) => i instanceof AdminOnlyCommand));
	}

	toBotCommands(): BotCommand[] {
		return this.#commands.map((i) => i.toBotCommand());
	}

	*[Symbol.iterator](): Generator<Command> {
		yield* this.#commands;
	}
}
