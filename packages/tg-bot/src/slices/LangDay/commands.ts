import { CommandGroup } from "@grammyjs/commands";
import { match } from "ts-pattern";
import { adminScope } from "../../adminScope.ts";
import { LanguageEnum } from "../../enums/Language.ts";
import { langDayService } from "./service.ts";

/**
 * Enabling/disabling language checks, or forcing a specific language for admins.
 * Also provides a command for any user to check the current day.
 */
export const langDayCommands = new CommandGroup();

const disabledMsg = `Language checks are disabled by admins

Проверка языка выключена администраторами.
`;
const freeDayMsg = `Today is a free day. You can speak Russian or English language.
Сегодня вольный день. Вы можете говорить на русском или английском.
`;

langDayCommands.command("today", "check current day language settings", async (ctx) => {
	const day = langDayService.getDaySettings();
	const msg = match(day)
		.with(undefined, () => disabledMsg)
		.with({ forced: true }, ({ value }) =>
			value === LanguageEnum.English
				? `English day was forced by admins`
				: `Русский день принудительно выставлен администраторами`,
		)
		.with(
			{ forced: false },
			({ value }) => value == null,
			() => freeDayMsg,
		)
		.with({ forced: false }, ({ value }) =>
			value === LanguageEnum.English ? `Today is an English day` : `Сегодня русский день`,
		)
		.exhaustive();

	await ctx.reply(msg);
});

langDayCommands.command("langchecks", "Toggle language checks on/off").addToScope(adminScope, async (ctx) => {
	const disabled = !langDayService.isLangDayDisabled();
	langDayService.setLangDayDisabled(disabled);
	await ctx.reply(`Language checks are now ${disabled ? "disabled" : "enabled"}`);
});

langDayCommands.command("forcelang", "Force specific language").addToScope(adminScope, async (ctx) => {
	const [, langStr] = ctx.message?.text?.trim().split(/\s+/, 2) ?? [];
	if (!langStr) {
		langDayService.setForcedLanguage(undefined);
		await ctx.reply("Forced day is now disabled.");
		return;
	}

	const langValue = match(langStr.toLowerCase())
		.with("en", "eng", "english", () => LanguageEnum.English)
		.with("ru", "rus", "russian", () => LanguageEnum.Russian)
		.otherwise(() => undefined);
	if (!langValue) {
		await ctx.reply(`Unknown language "${langStr}"`);
		return;
	}
	langDayService.setForcedLanguage(langValue);
	await ctx.reply(`Language is now forced to ${langValue}`);
});
