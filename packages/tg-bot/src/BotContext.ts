import { type Api, Context } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import type { Logger } from "pino";
import type { DIContainer } from "./container.ts";
import { logger as baseLogger } from "./logger.ts";
import { raise } from "./utils/raise.ts";

export class BotContext extends Context {
	logger: Logger;
	#container?: DIContainer;

	get container(): DIContainer {
		return this.#container ?? raise("Container not initialized. Make sure containerMiddleware is applied.");
	}

	set container(container: DIContainer) {
		this.#container = container;
	}

	constructor(update: Update, api: Api, me: UserFromGetMe) {
		super(update, api, me);

		this.logger = baseLogger.child({
			messageId: this.msgId,
			userName: this.message?.from.username,
			userId: this.message?.from.id,
			chatId: this.chatId,
		});
	}
}
