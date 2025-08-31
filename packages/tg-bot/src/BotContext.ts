import { type Api, Context } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import type { Logger } from "pino";
import { logger as baseLogger } from "./logger.ts";
import { getConfig } from "./models/config.ts";
import { ChatAdminRepo } from "./slices/ChatAdmins/service.ts";

// Bot context has transient scope, so we need to store admin cache outside of it
let chatAdminRepo: ChatAdminRepo | undefined;

export class BotContext extends Context {
	readonly targetChatId: number;
	readonly chatAdminRepo: ChatAdminRepo;
	logger: Logger;

	constructor(update: Update, api: Api, me: UserFromGetMe) {
		super(update, api, me);
		const chatId = getConfig().chatId;

		this.targetChatId = chatId;
		chatAdminRepo ??= new ChatAdminRepo(chatId, api.getChatAdministrators.bind(api));
		this.chatAdminRepo = chatAdminRepo;
		this.logger = baseLogger.child({
			messageId: this.message?.message_id,
			userName: this.message?.from.username,
			userId: this.message?.from.id,
		});
	}
}
