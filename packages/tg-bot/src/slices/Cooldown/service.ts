import { Time } from "../../enums/Time.ts";
import { formatDuration } from "../../utils/duration.ts";

const MAX_COOLDOWN = 3 * Time.Hours;
const DEFAULT_COOLDOWN = 10 * Time.Minutes;

class CooldownService {
	#activeUntilTs: number | undefined;
	#coolDownMs: number = DEFAULT_COOLDOWN;

	get maxCooldown(): number {
		return MAX_COOLDOWN;
	}

	get defaultCooldown() {
		return DEFAULT_COOLDOWN;
	}

	isCoolingDown(): boolean {
		return this.#activeUntilTs != null && this.#activeUntilTs > Date.now();
	}

	getCooldownEndTime(): Date | undefined {
		if (!this.#activeUntilTs) {
			return undefined;
		}
		return new Date(this.#activeUntilTs);
	}

	activateCooldown(): void {
		this.#activeUntilTs = Date.now() + this.#coolDownMs;
	}

	getCooldownValue(): number {
		return this.#coolDownMs;
	}

	setCooldownValue(value: number): void {
		if (!Number.isInteger(value) || value < 0) {
			throw new TypeError(`Cooldown value must be a non-negative integer, got ${value} instead`);
		}
		if (value > MAX_COOLDOWN) {
			throw new RangeError(`Cooldown value can't be greater than ${formatDuration(MAX_COOLDOWN)}`);
		}

		if (this.#activeUntilTs != null) {
			const newActiveUntilTs = this.#activeUntilTs - this.#coolDownMs + value;
			this.#activeUntilTs = newActiveUntilTs;
		}
		this.#coolDownMs = value;
	}

	/** Clear current cooldown, as well as set cooldown value to default */
	reset() {
		this.#activeUntilTs = undefined;
		this.#coolDownMs = this.defaultCooldown;
	}
}

// Singleton by default
export const cooldownService = new CooldownService();
