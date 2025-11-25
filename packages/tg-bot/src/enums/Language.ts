export const LanguageEnum = {
	Russian: "ru",
	English: "en",
} as const;
export type LanguageEnum = (typeof LanguageEnum)[keyof typeof LanguageEnum];

export function isLangEnum(value: unknown): value is LanguageEnum {
	return (Object.values(LanguageEnum) as unknown[]).includes(value);
}
