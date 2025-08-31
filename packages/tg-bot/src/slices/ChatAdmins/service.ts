import type { Api } from "grammy";
import { Time } from "../../enums/Time.ts";
import { logger } from "../../logger.ts";

export class ChatAdminRepo {
	readonly #getChatAdministrators: Api["getChatAdministrators"];
	readonly #chatId: number;
	readonly #admins = new Set<number>();

	#refreshedAt: number | undefined;
	#ttl = 3 * Time.Hours;

	// getChatAdministrators of api must be bound, as it's a method, not a function
	constructor(chatId: number, getChatAdministrators: Api["getChatAdministrators"]) {
		this.#chatId = chatId;
		this.#getChatAdministrators = getChatAdministrators;
	}

	getValidUntil(): Date {
		if (!this.#refreshedAt) {
			return new Date(0);
		}
		return new Date(this.#refreshedAt + this.#ttl);
	}

	isCacheValid(): boolean {
		return this.getValidUntil().getTime() > Date.now();
	}

	async getAdminsIds(signal?: AbortSignal): Promise<number[]> {
		if (!this.isCacheValid()) {
			logger.debug({ validUntil: this.getValidUntil() }, "Admin cache invalid, refreshing admins list");
			await this.refreshAdminsList(signal);
		} else {
			logger.trace({ validUntil: this.getValidUntil(), admins: Array.from(this.#admins) }, "Using cached admins list");
		}
		return Array.from(this.#admins);
	}

	async refreshAdminsList(signal?: AbortSignal) {
		const admins = await this.#getChatAdministrators(this.#chatId, signal);
		logger.trace({ admins }, "Admins list fetched");
		this.#admins.clear();
		for (const admin of admins) {
			this.#admins.add(admin.user.id);
		}
	}
}
