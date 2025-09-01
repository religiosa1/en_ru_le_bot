export const LanguageEnum = {
	Russian: "ru",
	English: "en",
} as const;
export type LanguageEnum = (typeof LanguageEnum)[keyof typeof LanguageEnum];
