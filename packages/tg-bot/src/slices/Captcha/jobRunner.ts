import type { Api } from "grammy";
import type { DIContainerInternal } from "../../container.ts";
import { Time } from "../../enums/Time.ts";
import { logger as baseLogger } from "../../logger.ts";
import type { CaptchaService } from "./service.ts";

const BACKGROUND_BAN_INTERVAL = 60 * Time.Seconds;

type CaptchaJobRunnerParams = Pick<DIContainerInternal, "captchaService" | "api" | "chatId">;

export class CaptchaJobRunner implements Disposable {
	readonly #chatId: number;
	readonly #api: Api;
	readonly #captchaService: CaptchaService;
	readonly #interval = setInterval(() => this.#runBackgroundJob(), BACKGROUND_BAN_INTERVAL);

	constructor({ chatId, api, captchaService }: CaptchaJobRunnerParams) {
		this.#chatId = chatId;
		this.#api = api;
		this.#captchaService = captchaService;
	}

	[Symbol.dispose](): void {
		clearInterval(this.#interval);
	}

	async #runBackgroundJob() {
		const logger = baseLogger.child({ jobId: Date.now() });
		logger.trace("Background captcha job started");
		try {
			const maxVerificationAge = await this.#captchaService.getMaxVerificationAge();
			const staleVerifications = await this.#captchaService.getVerificationsOlderThan(Date.now() - maxVerificationAge);
			if (staleVerifications.length) {
				logger.info({ staleVerifications }, "Stale verifications for users, proceeding with a ban");
			}
			for (const userId of staleVerifications) {
				try {
					await this.#api.banChatMember(this.#chatId, userId);
					await this.#captchaService.removeUserVerificationCheck(userId);
				} catch (error) {
					logger.error({ userId, error }, "Error while processing stale verification");
				}
			}
			logger.trace("Background captcha job ended");
		} catch (error) {
			logger.error({ error }, "Error in background captcha job");
		}
	}
}
