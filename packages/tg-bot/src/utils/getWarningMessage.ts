import { LanguageEnum } from "../enums/Language.ts";
import { assertNever } from "./assertNever.ts";

export function getWarningMessage(language: LanguageEnum): string {
	switch (language) {
		case LanguageEnum.English:
			return `Hey, today is a Russian day. Try to speak Russian!`;
		case LanguageEnum.Russian:
			return `Эй, сегодня день английского. Пытайся говорить на английском!`;
		default:
			assertNever(language, `Unsupported language code value: ${language}`);
	}
}
