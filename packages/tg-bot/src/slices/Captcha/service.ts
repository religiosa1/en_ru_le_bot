import type { Api } from "grammy";
import type { DIContainerInternal } from "../../container.ts";
import { Time } from "../../enums/Time.ts";
import { logger as baseLogger } from "../../logger.ts";
import type { CaptchaRepository } from "./CaptchaRepository.ts";
import type { CaptchaSettingsRepository } from "./CaptchaSettingsRepository.ts";
import type { MemberVerification } from "./models.ts";

const BACKGROUND_BAN_INTERVAL = 60 * Time.Seconds;

interface VerificationResult {
	correct: boolean;
	expectedAnswer: string | undefined;
	attemptsMade: number;
}

type CaptchaServiceParams = Pick<DIContainerInternal, "api" | "chatId"> & {
	captchaRepository: CaptchaRepository;
	captchaSettingsRepository: CaptchaSettingsRepository;
};

export class CaptchaService implements Disposable {
	readonly #chatId: number;
	readonly #api: Api;
	readonly #repository: CaptchaRepository;
	readonly #settings: CaptchaSettingsRepository;
	readonly #interval = setInterval(() => this.#runBackgroundJob(), BACKGROUND_BAN_INTERVAL);

	constructor({ chatId, api, captchaRepository, captchaSettingsRepository }: CaptchaServiceParams) {
		this.#chatId = chatId;
		this.#api = api;
		this.#repository = captchaRepository;
		this.#settings = captchaSettingsRepository;
	}

	[Symbol.dispose](): void {
		clearInterval(this.#interval);
	}

	async getEnabled(): Promise<boolean> {
		return await this.#settings.getEnabled();
	}

	async toggleEnabled(): Promise<boolean> {
		const newValue = !(await this.#settings.getEnabled());
		await this.#settings.setEnabled(newValue);
		return newValue;
	}

	async getBotsAllowed(): Promise<boolean> {
		return await this.#settings.getBotsAllowed();
	}

	async toggleBotsAllowed(): Promise<boolean> {
		const newValue = !(await this.#settings.getBotsAllowed());
		await this.#settings.setBotsAllowed(newValue);
		return newValue;
	}

	async addUserVerificationCheck(verification: MemberVerification): Promise<void> {
		await this.#repository.addUserVerificationCheck(verification);
	}

	async addUserVerificationMsg(userId: number, msgId: number): Promise<void> {
		await this.#repository.addUserVerificationMsg(userId, msgId);
	}

	async getUserNeedsVerification(userId: number): Promise<boolean> {
		const expectedAnswer = await this.#repository.getExpectedAnswer(userId);
		return expectedAnswer != null;
	}

	async verifyUserAnswer(userId: number, answer: string): Promise<VerificationResult> {
		const attemptsMade = await this.#repository.incrAttemptsMade(userId);
		const expectedAnswer = await this.#repository.getExpectedAnswer(userId);

		return {
			correct: expectedAnswer == null || answer.trim() === expectedAnswer,
			expectedAnswer,
			attemptsMade,
		};
	}

	async getVerificationQuestion(userId: number): Promise<string | undefined> {
		return await this.#repository.getVerificationQuestion(userId);
	}

	async removeUserVerificationCheck(userIdOrUsername: number | string): Promise<void> {
		const msgIds = await this.#repository.getVerificationMsgIds(userIdOrUsername);
		await this.#api.deleteMessages(this.#chatId, msgIds);
		await this.#repository.removeUserVerificationCheck(userIdOrUsername);
	}

	async #runBackgroundJob() {
		const logger = baseLogger.child({ jobId: Date.now() });
		logger.debug("Background captcha job started");
		try {
			const maxVerificationAge = await this.#settings.getMaxVerificationAge();
			const staleVerifications = await this.#repository.getVerificationsOlderThan(Date.now() - maxVerificationAge);
			if (staleVerifications.length) {
				logger.info({ staleVerifications }, "Stale verifications for users, proceeding with a ban");
			}
			for (const userId of staleVerifications) {
				try {
					await this.#api.banChatMember(this.#chatId, userId);
					await this.removeUserVerificationCheck(userId);
				} catch (error) {
					logger.error({ userId, error }, "Error while processing stale verification");
				}
			}
			logger.debug("Background captcha job ended");
		} catch (error) {
			logger.error({ error }, "Error in background captcha job");
		}
	}
}
