import type { Api } from "grammy";
import type { DIContainerInternal } from "../../container.ts";
import type { CaptchaRepository } from "./CaptchaRepository.ts";
import type { CaptchaSettingsRepository } from "./CaptchaSettingsRepository.ts";
import type { MemberVerification } from "./models.ts";

interface VerificationResult {
	correct: boolean;
	expectedAnswer: string | undefined;
	attemptsMade: number;
}

type CaptchaServiceParams = Pick<DIContainerInternal, "api" | "chatId"> & {
	captchaRepository: CaptchaRepository;
	captchaSettingsRepository: CaptchaSettingsRepository;
};

export class CaptchaService {
	readonly #chatId: number;
	readonly #api: Api;
	readonly #repository: CaptchaRepository;
	readonly #settings: CaptchaSettingsRepository;

	constructor({ chatId, api, captchaRepository, captchaSettingsRepository }: CaptchaServiceParams) {
		this.#chatId = chatId;
		this.#api = api;
		this.#repository = captchaRepository;
		this.#settings = captchaSettingsRepository;
	}

	// settings

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

	async getMaxVerificationAge(): Promise<number> {
		return this.#settings.getMaxVerificationAge();
	}

	async setMaxVerificationAge(value: number): Promise<void> {
		if (!Number.isInteger(value) || value <= 0) {
			throw new TypeError("MaxVerificationAge must be a positive int (ms)");
		}
		await this.#settings.setMaxVerificationAge(value);
	}

	// actions

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

	async getUserIdsForVerificationsOlderThan(timestampMs: number): Promise<number[]> {
		return await this.#repository.getUserIdsForVerificationsOlderThan(timestampMs);
	}
}
