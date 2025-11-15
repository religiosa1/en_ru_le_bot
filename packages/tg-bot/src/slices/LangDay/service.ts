import { LanguageEnum } from "../../enums/Language.ts";

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
	#langDayDisabled = false;
	#forcedLanguage: LanguageEnum | undefined = undefined;
	#isOtherLangCheckDisabled = false;

	getDaySettings(dayNumber: number = new Date().getDay()): DayResponse | undefined {
		if (this.#langDayDisabled) return undefined;

		return this.#forcedLanguage
			? {
					value: this.#forcedLanguage,
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

	isLangDayDisabled(): boolean {
		return this.#langDayDisabled;
	}

	setLangDayDisabled(value: boolean): void {
		this.#langDayDisabled = !!value;
	}

	isOtherLangCheckDisabled(): boolean {
		return this.#isOtherLangCheckDisabled;
	}

	setOtherLangCheckDisabled(value: boolean) {
		this.#isOtherLangCheckDisabled = value;
	}

	getForcedLanguage(): LanguageEnum | undefined {
		return this.#forcedLanguage;
	}

	setForcedLanguage(value: LanguageEnum | undefined): void {
		if (value !== undefined && !Object.values(LanguageEnum).includes(value)) {
			value = undefined;
		}
		this.#forcedLanguage = value;
	}
}
