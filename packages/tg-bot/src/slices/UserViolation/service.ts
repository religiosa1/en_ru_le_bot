import type { ViolationCounterRepository, ViolationSettingsRepository, ViolationStats } from "./models.ts";
import { violationCounterRepository } from "./ViolationCounterRepositoryValkey.ts";
import { violationSettingsRepository } from "./ViolationSettingsRepositoryValkey.ts";

export class UserViolationService {
	readonly #repository: ViolationCounterRepository;
	readonly #settings: ViolationSettingsRepository;

	constructor(repository: ViolationCounterRepository, settings: ViolationSettingsRepository) {
		this.#repository = repository;
		this.#settings = settings;
	}

	async pardon(userIdOrHandle: number | string): Promise<boolean> {
		return await this.#repository.removeViolation(userIdOrHandle);
	}

	async pardonAll(): Promise<void> {
		await this.#repository.removeAllViolations();
	}

	async registerViolation(userId: number, username: string | undefined): Promise<ViolationStats> {
		const warningsExpiry = await this.#settings.getWarningsExpiry();
		const value = await this.#repository.registerViolation(userId, username, warningsExpiry);
		const maxViolations = await this.#settings.getMaxViolationNumber();
		return {
			value,
			maxViolations,
		};
	}

	async getMuteEnabled(): Promise<boolean> {
		return await this.#settings.getMuteEnabled();
	}
	async setMuteEnabled(value: boolean) {
		await this.#settings.setMuteEnabled(value);
	}

	async getWarningsExpiry(): Promise<number> {
		return await this.#settings.getWarningsExpiry();
	}
	async setWarningsExpiry(expiryMs: number): Promise<void> {
		await this.#settings.setWarningsExpiry(expiryMs);
	}

	async getMuteDuration(): Promise<number> {
		return await this.#settings.getMuteDuration();
	}
	async setMuteDuration(durationMs: number): Promise<void> {
		await this.#settings.setMuteDuration(durationMs);
	}

	async getMaxViolationNumber(): Promise<number> {
		return await this.#settings.getMaxViolationNumber();
	}
	async setMaxViolationNumber(num: number): Promise<void> {
		await this.#settings.setMaxViolationNumber(num);
	}
}

export const userViolationService = new UserViolationService(violationCounterRepository, violationSettingsRepository);
