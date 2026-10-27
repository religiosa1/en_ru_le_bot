import { match } from "ts-pattern";
import { LanguageEnum } from "../../enums/Language.ts";
import { CommandGroup } from "../../models/CommandGroup.ts";
import { DetectorName, isDetectorName } from "./detectors.ts";
import { SHADOW_STATS_RETENTION_DAYS, type ShadowStats } from "./shadowStatsRepository.ts";

const scope = (name: string) => `lang_day::command::${name}`;

export const langDayCommands = new CommandGroup()
	.addCommand("today", "check current day: whether it's English, Russian, or Free", async (ctx) => {
		const logger = ctx.getLogger(scope("today"));
		const { langDayService } = ctx.container;

		logger.info("Today command called");
		const day = await langDayService.getDaySettings();
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
	.addAdminCommand("langchecks", "Toggle en/ru days  on/off", async (ctx) => {
		const logger = ctx.getLogger(scope("langchecks"));
		const { langDayService } = ctx.container;

		const disabled = !(await langDayService.isLangDayDisabled());
		await langDayService.setLangDayDisabled(disabled);
		logger.info(`Language checks disabled status changed: ${disabled}`);
		await ctx.reply(`Language checks are now ${formatDisabled(disabled)}`);
	})
	.addAdminCommand("otherlang", "Toggle check for message language outside of en/ru on/off", async (ctx) => {
		const logger = ctx.getLogger(scope("langchecks"));
		const { langDayService } = ctx.container;

		const disabled = !(await langDayService.isOtherLangChecksDisabled());
		await langDayService.setOtherLangChecksDisabled(disabled);
		logger.info(`Other language checks disabled status changed: ${disabled}`);
		await ctx.reply(`Language checks are now ${formatDisabled(disabled)}`);
	})
	.addAdminCommand("forcelang", "[en|ru] Force a specific language", async (ctx) => {
		const logger = ctx.getLogger(scope("forcelang"));
		const { langDayService } = ctx.container;

		const langStr = ctx.match?.toString();
		if (!langStr) {
			logger.info(`Forced language day disabled`);
			await langDayService.setForcedLanguage(undefined);
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
		await langDayService.setForcedLanguage(langValue);
		logger.info(`Forced language day set to ${langValue}`);
		await ctx.reply(`Language is now forced to ${langValue}`);
	})
	.addHiddenAdminCommand("langdetector", async (ctx) => {
		const logger = ctx.getLogger(scope("langdetector"));
		const { langDayService } = ctx.container;

		const detector = ctx.match?.toString().trim().toLowerCase();
		if (!detector) {
			await ctx.reply(`Active language detector: ${await langDayService.getDetector()}`);
			return;
		}
		if (!isDetectorName(detector)) {
			await ctx.reply(`Unknown detector "${detector}", expected one of: ${Object.values(DetectorName).join(", ")}`);
			return;
		}
		await langDayService.setDetector(detector);
		logger.info(`Language detector set to ${detector}`);
		await ctx.reply(`Language detector is now ${detector}`);
	})
	.addHiddenAdminCommand("langshadow", async (ctx) => {
		const { langDayService } = ctx.container;

		const days = Number.parseInt(ctx.match?.toString() || "7", 10);
		if (!(days >= 1 && days <= SHADOW_STATS_RETENTION_DAYS)) {
			await ctx.reply(`Number of days must be an integer in range 1..${SHADOW_STATS_RETENTION_DAYS}`);
			return;
		}
		const stats = await langDayService.getShadowStats(days);
		const active = await langDayService.getDetector();
		await ctx.reply(formatShadowStats(stats, days, active));
	});

const MAX_DISAGREEMENTS_SHOWN = 10;

function formatShadowStats(stats: ShadowStats, days: number, active: DetectorName): string {
	const percent = (n: number) => (stats.compared ? `${((n / stats.compared) * 100).toFixed(1)}%` : "n/a");
	const lines = [
		`Lingua vs tongue, last ${days} day(s), active: ${active}`,
		`compared: ${stats.compared}`,
		`same verdict: ${stats.verdictsAgreed} (${percent(stats.verdictsAgreed)})`,
		`same reaction: ${stats.actionsAgreed} (${percent(stats.actionsAgreed)})`,
		`lingua would warn: ${stats.linguaActed}`,
		`tongue would warn: ${stats.tongueActed}`,
	];
	if (stats.disagreements.length) {
		lines.push("", "Disagreements (day: lingua → tongue):");
		for (const { target, lingua, tongue, count } of stats.disagreements.slice(0, MAX_DISAGREEMENTS_SHOWN)) {
			lines.push(`${target ?? "free"}: ${lingua} → ${tongue} — ${count}`);
		}
	}
	return lines.join("\n");
}

function formatDisabled(value: boolean): string {
	return value ? "disabled" : "enabled";
}
