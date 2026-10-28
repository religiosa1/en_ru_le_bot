import type { GlideClient } from "@valkey/valkey-glide";
import { COMMON_KEY_PREFIX } from "../../constants.ts";
import { Time } from "../../enums/Time.ts";
import { toBool, toNumber } from "../../utils/glideParsers.ts";
import type { ViolationSettingsRepository } from "./models.ts";

const SETTINGS_KEY_PREFIX = COMMON_KEY_PREFIX + "violation_settings:";

export const DEFAULT_MUTE_ENABLED = true;
const MUTE_ENABLED_KEY = SETTINGS_KEY_PREFIX + "mute_enabled";

export const DEFAULT_MAX_VIOLATION = 3;
const MAX_VIOLATIONS_KEY = SETTINGS_KEY_PREFIX + "max_violations";

export const DEFAULT_MUTE_DURATION = 15 * Time.Minutes;
const MUTE_DURATION_KEY = SETTINGS_KEY_PREFIX + "mute_duration";

export const DEFAULT_WARNINGS_EXPIRY = 3 * Time.Hours;
const WARNINGS_EXPIRY_KEY = SETTINGS_KEY_PREFIX + "warnings_expiry";

export class ViolationSettingsRepositoryValkey implements ViolationSettingsRepository {
	#client: GlideClient;

	constructor({ valkeyClient }: { valkeyClient: GlideClient }) {
		this.#client = valkeyClient;
	}

	async getMuteEnabled(): Promise<boolean> {
		const val = await this.#client.get(MUTE_ENABLED_KEY);
		return toBool(val) ?? DEFAULT_MUTE_ENABLED;
	}

	async setMuteEnabled(val: boolean): Promise<void> {
		await this.#client.set(MUTE_ENABLED_KEY, val.toString());
	}

	async getMaxViolationNumber(): Promise<number> {
		const val = await this.#client.get(MAX_VIOLATIONS_KEY);
		return toNumber(val) ?? DEFAULT_MAX_VIOLATION;
	}

	async setMaxViolationNumber(val: number): Promise<void> {
		if (!Number.isInteger(val) || val < 0) {
			throw new TypeError(`Max violations number must be a non-negative integer, got ${val}`);
		}
		await this.#client.set(MAX_VIOLATIONS_KEY, val.toString());
	}

	async getMuteDuration(): Promise<number> {
		const val = await this.#client.get(MUTE_DURATION_KEY);
		return toNumber(val) ?? DEFAULT_MUTE_DURATION;
	}

	async setMuteDuration(val: number): Promise<void> {
		if (!Number.isInteger(val) || val <= 0) {
			throw new TypeError(`Mute duration must be a positive integer, got ${val}`);
		}
		await this.#client.set(MUTE_DURATION_KEY, val.toString());
	}

	async getWarningsExpiry(): Promise<number> {
		const val = await this.#client.get(WARNINGS_EXPIRY_KEY);
		return toNumber(val) ?? DEFAULT_WARNINGS_EXPIRY;
	}

	async setWarningsExpiry(val: number): Promise<void> {
		if (!Number.isInteger(val) || val < 0) {
			throw new TypeError(`Warnings expiry must be a positive integer, got ${val}`);
		}
		await this.#client.set(WARNINGS_EXPIRY_KEY, val.toString());
	}
}
