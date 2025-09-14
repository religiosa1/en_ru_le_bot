import type { Api } from "grammy";
import type { DIContainerInternal } from "../../container.ts";
import { Time } from "../../enums/Time.ts";
import { logger as baseLogger } from "../../logger.ts";

type ChatAdminRepoParams = Pick<DIContainerInternal, "api" | "chatId">;
export class ChatAdminRepo {
	readonly #api: Api;
	readonly #chatId: number;
	readonly #admins = new Set<number>();
	readonly #logger = baseLogger.child({ scope: "chat_admins::service" });

	#refreshedAt: number | undefined;
	#ttl = 3 * Time.Hours;

	constructor({ chatId, api }: ChatAdminRepoParams) {
		this.#chatId = chatId;
		this.#api = api;
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
			this.#logger.debug({ validUntil: this.getValidUntil() }, "Admin cache invalid, refreshing admins list");
			await this.refreshAdminsList(signal);
		} else {
			this.#logger.trace(
				{ validUntil: this.getValidUntil(), admins: Array.from(this.#admins) },
				"Using cached admins list",
			);
		}
		return Array.from(this.#admins);
	}

	async refreshAdminsList(signal?: AbortSignal) {
		const admins = await this.#api.getChatAdministrators(this.#chatId, signal);
		this.#refreshedAt = Date.now();
		this.#logger.trace({ admins }, "Admins list fetched");
		this.#admins.clear();
		for (const admin of admins) {
			this.#admins.add(admin.user.id);
		}
	}
}
