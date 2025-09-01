import type { BotContext } from "../BotContext.ts";
import type { LanguageEnum } from "../enums/Language.ts";

export interface BotContextWithMsgLanguage extends BotContext {
	language: LanguageEnum;
	msgLanguage: LanguageEnum;
}

export function isBotContextWithMsgLanguage(ctx: BotContext): ctx is BotContextWithMsgLanguage {
	return "language" in ctx && "msgLanguage" in ctx;
}
