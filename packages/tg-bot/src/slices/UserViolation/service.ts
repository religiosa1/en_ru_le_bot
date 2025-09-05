import type { ViolationCounterRepository, ViolationSettingsRepository, ViolationStats } from "./models.ts";

export class UserViolationService {
	readonly #repository: ViolationCounterRepository;
	readonly #settings: ViolationSettingsRepository;

	constructor({
		violationCounterRepository,
		violationSettingsRepository,
	}: {
		violationCounterRepository: ViolationCounterRepository;
		violationSettingsRepository: ViolationSettingsRepository;
	}) {
		this.#repository = violationCounterRepository;
		this.#settings = violationSettingsRepository;
	}

	async pardon(userIdOrHandle: number | string): Promise<number | undefined> {
		return await this.#repository.removeViolation(userIdOrHandle);
	}

	async pardonAll(): Promise<number[]> {
		return await this.#repository.removeAllViolations();
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
