import { Context } from "grammy";
import type { Logger } from "pino";
import type { DIContainer } from "./container.ts";
import { logger as baseLogger } from "./logger.ts";
import { raise } from "./utils/raise.ts";

export class BotContext extends Context {
	#container?: DIContainer;

	get container(): DIContainer {
		return this.#container ?? raise("Container not initialized. Make sure containerMiddleware is applied.");
	}

	set container(container: DIContainer) {
		this.#container = container;
	}

	getLogger(scope: string): Logger {
		return baseLogger.child({
			messageId: this.msgId,
			userName: this.message?.from.username,
			userId: this.message?.from.id,
			chatId: this.chatId,
			scope,
		});
	}
}
