import type { GlideClient } from "@valkey/valkey-glide";
import { COMMON_KEY_PREFIX } from "../../constants.ts";
import type { DIContainerInternal } from "../../container.ts";
import { Time } from "../../enums/Time.ts";
import { toNumber } from "../../utils/glideParsers.ts";

const DEFAULT_COOLDOWN = 2 * Time.Minutes;

const COOLDOWN_DURATION_KEY = `${COMMON_KEY_PREFIX}cooldown:duration`;

type CooldownSettingsRepositoryParams = Pick<DIContainerInternal, "valkeyClient">;

export class CooldownSettingsRepository {
	readonly #client: GlideClient;

	constructor({ valkeyClient }: CooldownSettingsRepositoryParams) {
		this.#client = valkeyClient;
	}

	async getCooldownDuration(): Promise<number> {
		const value = await this.#client.get(COOLDOWN_DURATION_KEY);
		return toNumber(value) ?? DEFAULT_COOLDOWN;
	}

	async setCooldownDuration(value: number): Promise<void> {
		await this.#client.set(COOLDOWN_DURATION_KEY, value.toString());
	}

	async resetCooldownDuration(): Promise<number> {
		await this.#client.set(COOLDOWN_DURATION_KEY, DEFAULT_COOLDOWN.toString());
		return DEFAULT_COOLDOWN;
	}
}
