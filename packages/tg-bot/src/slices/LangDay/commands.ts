import { match } from "ts-pattern";
import { LanguageEnum } from "../../enums/Language.ts";
import { CommandGroup } from "../../models/CommandGroup.ts";

const scope = (name: string) => `lang_day::command::${name}`;

export const langDayCommands = new CommandGroup()
	.addCommand("today", "check current day: whether it's English, Russian, or Free", async (ctx) => {
		const logger = ctx.getLogger(scope("today"));
		const { langDayService } = ctx.container;

		logger.info("Today command called");
		const day = langDayService.getDaySettings();
		const msg = match(day)
			.with(undefined, () =>
				["Language checks are disabled by admins", "Проверка языка выключена администраторами."].join("\n\n"),
			)
			.with({ forced: true }, ({ value }) =>
				value === LanguageEnum.English
					? `English day was forced by admins`
					: `Русский день принудительно выставлен администраторами`,
			)
			.with(
				{ forced: false },
				({ value }) => value == null,
				() =>
					[
						"Today is a free day. You can speak Russian or English language.",
						"Сегодня свободный день. Вы можете говорить на русском или английском.",
					].join("\n\n"),
			)
			.with({ forced: false }, ({ value }) =>
				value === LanguageEnum.English ? `Today is an English day` : `Сегодня русский день`,
			)
			.exhaustive();

		await ctx.reply(msg);
	})
	.addAdminCommand("langchecks", "Toggle language checks on/off", async (ctx) => {
		const logger = ctx.getLogger(scope("langchecks"));
		const { langDayService } = ctx.container;

		const disabled = !langDayService.isLangDayDisabled();
		langDayService.setLangDayDisabled(disabled);
		logger.info(`Language checks disabled status changed: ${disabled}`);
		await ctx.reply(`Language checks are now ${disabled ? "disabled" : "enabled"}`);
	})
	.addAdminCommand("forcelang", "[en|ru] Force a specific language", async (ctx) => {
		const logger = ctx.getLogger(scope("forcelang"));
		const { langDayService } = ctx.container;

		const langStr = ctx.match?.toString();
		if (!langStr) {
			logger.info(`Forced language day disabled`);
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
		logger.info(`Forced language day set to ${langValue}`);
		await ctx.reply(`Language is now forced to ${langValue}`);
	});
