import type { GlideClient } from "@valkey/valkey-glide";
import { COMMON_KEY_PREFIX } from "../../constants.ts";
import type { DIContainerInternal } from "../../container.ts";
import { isLangEnum, type LanguageEnum } from "../../enums/Language.ts";
import { toBool } from "../../utils/glideParsers.ts";
import { DetectorName, isDetectorName } from "./detectors.ts";

const LANGDAY_CHECKS_DISABLED_KEY = `${COMMON_KEY_PREFIX}langday:langday_checks_disabled`;
const OTHERLANG_CHECKS_DISABLED_KEY = `${COMMON_KEY_PREFIX}langday:otherlang_checks_disabled`;
const FORCED_LANG_KEY = `${COMMON_KEY_PREFIX}langday:forced_lang`;
const DETECTOR_KEY = `${COMMON_KEY_PREFIX}langday:detector`;

type LangdaySettingsRepositoryParams = Pick<DIContainerInternal, "valkeyClient">;

export class LangdaySettingsRepository {
	readonly #client: GlideClient;

	constructor({ valkeyClient }: LangdaySettingsRepositoryParams) {
		this.#client = valkeyClient;
	}

	async getLangDayDisabled(): Promise<boolean | undefined> {
		const value = await this.#client.get(LANGDAY_CHECKS_DISABLED_KEY);
		return toBool(value);
	}

	async setLangDayDisabled(value: boolean): Promise<void> {
		value = !!value;
		await this.#client.set(LANGDAY_CHECKS_DISABLED_KEY, value.toString());
	}

	async getOtherLangChecksDisabled(): Promise<boolean | undefined> {
		const value = await this.#client.get(OTHERLANG_CHECKS_DISABLED_KEY);
		return toBool(value);
	}

	async setOtherLangChecksDisabled(value: boolean): Promise<void> {
		value = !!value;
		await this.#client.set(OTHERLANG_CHECKS_DISABLED_KEY, value.toString());
	}

	async getForcedLang(): Promise<LanguageEnum | undefined> {
		const value = await this.#client.get(FORCED_LANG_KEY);
		return isLangEnum(value) ? value : undefined;
	}

	async setForcedLang(lang: LanguageEnum | undefined): Promise<void> {
		if (!lang) {
			await this.#client.del([FORCED_LANG_KEY]);
		} else {
			await this.#client.set(FORCED_LANG_KEY, lang);
		}
	}

	async getDetector(): Promise<DetectorName> {
		const value = await this.#client.get(DETECTOR_KEY);
		return isDetectorName(value) ? value : DetectorName.Lingua;
	}

	async setDetector(detector: DetectorName): Promise<void> {
		await this.#client.set(DETECTOR_KEY, detector);
	}
}
