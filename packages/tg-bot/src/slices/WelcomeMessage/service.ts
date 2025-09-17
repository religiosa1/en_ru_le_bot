import type { User } from "grammy/types";
import type { DIContainerInternal } from "../../container.ts";
import { logger as baseLogger } from "../../logger.ts";
import { type MarkdownString, makeMdMention, md } from "../../utils/md.ts";

const MESSAGE_INTERVAL = 10;

type WelcomeServiceParams = Pick<DIContainerInternal, "api" | "chatId">;
export class WelcomeService {
	readonly #chatId;
	readonly #api;
	readonly #logger = baseLogger.child({ scope: "welcome::service" });

	#lastSendLongWelcomeMsgId: number | null = null;
	// Interval between messages is stored in memory, as this isn't a crucial thing.
	#nMessagesToLongWelcome = 0;

	constructor({ chatId, api }: WelcomeServiceParams) {
		this.#chatId = chatId;
		this.#api = api;
	}

	registerMessage(): void {
		if (this.#nMessagesToLongWelcome > 0) {
			this.#nMessagesToLongWelcome--;
		}
	}

	async welcomeUser(user: User) {
		try {
			const isLongWelcome = this.#nMessagesToLongWelcome <= 0;
			if (isLongWelcome) {
				this.#logger.debug({ user }, "Sending long welcome");
			} else {
				this.#logger.debug({ user, nMessagesToLongWelcome: this.#nMessagesToLongWelcome }, "Sending short welcome");
			}
			const text = isLongWelcome ? this.getWelcomeMessage(user) : makeMdMention(user);

			const result = await this.#api.sendMessage(this.#chatId, text, {
				parse_mode: "MarkdownV2",
				reply_parameters:
					this.#lastSendLongWelcomeMsgId && !isLongWelcome
						? {
								message_id: this.#lastSendLongWelcomeMsgId,
							}
						: undefined,
			});
			if (isLongWelcome) {
				this.#lastSendLongWelcomeMsgId = result.message_id;
				this.#nMessagesToLongWelcome = MESSAGE_INTERVAL;
			}
		} catch (error) {
			this.#logger.error({ error }, "Error while sending a welcome message to a customer");
		}
	}

	getWelcomeMessage(user: User): MarkdownString {
		const mention = makeMdMention(user);
		return md`
		Welcome, ${mention}!
		This chat is made for English and Russian languages practice.

		Monday, Wednesday and Friday — Russian days
		Tuesday, Thursday and Saturday — English days.
		Sunday — free day. 

		* DO NOT WRITE TO OTHER MEMBERS DIRECTLY BEFORE YOU AT LEAST KNOW THEM. *
		Write to the admins if someone is bothering you, so the admins may settle the situation.

		Добро пожаловать, ${mention}!
		Данный чат предназначен для практики английского или русского языков.

		Понедельник, среда, пятница — русский день. 
		Вторник, четверг и суббота — английский. 
		Воскресенье — свободный день.

		* НЕ ПИШИТЕ ДРУГИМ УЧАСТНИКАМ В ЛИЧКУ ПОКА ВЫ С НИМИ ХОТЯ БЫ НЕ ПОЗНАКОМИТЕСЬ. *
		Если вам кто-то докучает, пишите админам, чтобы они могли урегулировать ситуацию.
  `;
	}
}
