import { LanguageEnum } from "../../enums/Language.ts";
import type { LangdaySettingsRepository } from "./repository.ts";

type DayResponse =
	| {
			value: LanguageEnum;
			forced: true;
	  }
	| {
			value: LanguageEnum | undefined;
			forced: false;
	  };

export class LangDayService {
	#settings: LangdaySettingsRepository;

	constructor({ langdaySettingsRepository }: { langdaySettingsRepository: LangdaySettingsRepository }) {
		this.#settings = langdaySettingsRepository;
	}

	async getDaySettings(dayNumber: number = new Date().getDay()): Promise<DayResponse | undefined> {
		const isDisabled = await this.#settings.getLangDayDisabled();
		if (isDisabled) return undefined;

		const forcedLanguage = await this.#settings.getForcedLang();

		return forcedLanguage
			? {
					value: forcedLanguage,
					forced: true,
			  }
			: {
					value: this.determineDay(dayNumber),
					forced: false,
			  };
	}

	determineDay(dayNumber: number = new Date().getDay()): LanguageEnum | undefined {
		switch (dayNumber) {
			case 0: // Sunday
				return undefined;
			case 1: // mon
				return LanguageEnum.Russian;
			case 2: // tue
				return LanguageEnum.English;
			case 3: // wed
				return LanguageEnum.Russian;
			case 4: // thu
				return LanguageEnum.English;
			case 5: // fri
				return LanguageEnum.Russian;
			case 6: // sat
				return LanguageEnum.English;
			default:
				throw new TypeError(`${dayNumber} is not a valid day of the week. Must be an int in range 0..=6`);
		}
	}

	async isLangDayDisabled(): Promise<boolean> {
		const isDisabled = await this.#settings.getLangDayDisabled();
		return !!isDisabled;
	}

	async setLangDayDisabled(value: boolean): Promise<void> {
		await this.#settings.setLangDayDisabled(value);
	}

	async isOtherLangChecksDisabled(): Promise<boolean> {
		const value = await this.#settings.getOtherLangChecksDisabled();
		return !!value;
	}

	async setOtherLangChecksDisabled(value: boolean): Promise<void> {
		return await this.#settings.setOtherLangChecksDisabled(value);
	}

	async getForcedLanguage(): Promise<LanguageEnum | undefined> {
		return await this.#settings.getForcedLang();
	}

	async setForcedLanguage(value: LanguageEnum | undefined): Promise<void> {
		return await this.#settings.setForcedLang(value);
	}
}
