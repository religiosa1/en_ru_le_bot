import { Time } from "../../enums/Time.ts";
import { formatDuration } from "../../utils/duration.ts";
import type { CooldownSettingsRepository } from "./repository.ts";

const MAX_COOLDOWN = 3 * Time.Hours;
interface CooldownSettingsParams {
	cooldownSettingsRepository: CooldownSettingsRepository;
}
export class CooldownService {
	#activeUntilTs: number | undefined;
	#settings: CooldownSettingsRepository;

	get maxCooldown(): number {
		return MAX_COOLDOWN;
	}

	constructor({ cooldownSettingsRepository }: CooldownSettingsParams) {
		this.#settings = cooldownSettingsRepository;
	}

	isCoolingDown(): boolean {
		return this.#activeUntilTs != null && this.#activeUntilTs > Date.now();
	}

	getCooldownEndTs(): number | undefined {
		return this.#activeUntilTs;
	}

	async activateCooldown(): Promise<void> {
		const coolDownMs = await this.#settings.getCooldownDuration();
		if (coolDownMs) {
			this.#activeUntilTs = Date.now() + coolDownMs;
		}
	}

	async getCooldownValue(): Promise<number> {
		return await this.#settings.getCooldownDuration();
	}

	async setCooldownValue(value: number): Promise<void> {
		if (!Number.isInteger(value) || value < 0) {
			throw new TypeError(`Cooldown value must be a non-negative integer, got ${value} instead`);
		}
		if (value > MAX_COOLDOWN) {
			throw new RangeError(`Cooldown value can't be greater than ${formatDuration(MAX_COOLDOWN)}`);
		}
		const oldCooldownValue = await this.#settings.getCooldownDuration();
		await this.#settings.setCooldownDuration(value);

		if (this.#activeUntilTs != null) {
			const newActiveUntilTs = this.#activeUntilTs - oldCooldownValue + value;
			this.#activeUntilTs = newActiveUntilTs;
		}
	}

	/** Clear current cooldown, as well as set cooldown value to default */
	async reset(): Promise<number> {
		this.#activeUntilTs = undefined;
		return await this.#settings.resetCooldownDuration();
	}
}
