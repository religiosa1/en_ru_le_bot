import type { GlideClient } from "@valkey/valkey-glide";
import { COMMON_KEY_PREFIX } from "../../constants.ts";
import type { DIContainerInternal } from "../../container.ts";
import { Time } from "../../enums/Time.ts";
import { toBool, toNumber } from "../../utils/glideParsers.ts";

const DEFAULT_ENABLED = true;
const DEFAULT_BOTS_ALLOWED = false;
const DEFAULT_MAX_VERIFICATION_AGE = 20 * Time.Minutes;

const CAPTCHA_SETTINGS_KEY_PREFIX = COMMON_KEY_PREFIX + "captcha_settings:";

const ENABLED_KEY = CAPTCHA_SETTINGS_KEY_PREFIX + "enabled";
const BOTS_ALLOWED_KEY = CAPTCHA_SETTINGS_KEY_PREFIX + "bots_allowed";
const MAX_VERIFICATION_AGE_KEY = CAPTCHA_SETTINGS_KEY_PREFIX + "max_verification_age";

type CaptchaRepositoryParams = Pick<DIContainerInternal, "valkeyClient">;

export class CaptchaSettingsRepository {
	readonly #client: GlideClient;

	constructor({ valkeyClient }: CaptchaRepositoryParams) {
		this.#client = valkeyClient;
	}

	async getEnabled(): Promise<boolean> {
		const value = await this.#client.get(ENABLED_KEY);
		return toBool(value) ?? DEFAULT_ENABLED;
	}

	async setEnabled(value: boolean): Promise<void> {
		await this.#client.set(ENABLED_KEY, (!!value).toString());
	}

	async getBotsAllowed(): Promise<boolean> {
		const value = await this.#client.get(BOTS_ALLOWED_KEY);
		return toBool(value) ?? DEFAULT_BOTS_ALLOWED;
	}

	async setBotsAllowed(value: boolean): Promise<void> {
		await this.#client.set(BOTS_ALLOWED_KEY, (!!value).toString());
	}

	async getMaxVerificationAge(): Promise<number> {
		const value = await this.#client.get(MAX_VERIFICATION_AGE_KEY);
		return toNumber(value) ?? DEFAULT_MAX_VERIFICATION_AGE;
	}
}
