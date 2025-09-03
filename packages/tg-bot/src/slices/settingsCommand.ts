import { dedent as d } from "ts-dedent";
import { Time } from "../enums/Time.ts";
import { CommandGroup } from "../models/CommandGroup.ts";
import { formatDuration } from "../utils/duration.ts";

export const settingsCommands = new CommandGroup().addAdminCommand(
	"settings",
	"display current bot settings",
	async (ctx) => {
		const { langDayService, userViolationService, cooldownService } = ctx.container;
		let msg = d`
    language checks: ${onOff(!langDayService.isLangDayDisabled())}
    mute capacity: ${onOff(await userViolationService.getMuteEnabled())}
    forced language: ${langDayService.getForcedLanguage() ?? "none"}
    mute duration: ${formatDuration(await userViolationService.getMuteDuration())}
    warnings number: ${await userViolationService.getMaxViolationNumber()}
    warnings expiry: ${formatDuration(await userViolationService.getWarningsExpiry())}
    cooldown: ${formatDuration(await cooldownService.getCooldownValue())}
    `;
		const cooldownUntil = cooldownService.getCooldownEndTs();
		if (cooldownUntil) {
			const cooldownFor = Date.now() - cooldownUntil;
			if (cooldownFor > 3 * Time.Seconds) {
				msg += `\ncurrent cooldown for: ${formatDuration(cooldownFor, { smallestUnit: "s" })}`;
			}
		}

		await ctx.reply(msg);
	},
);

function onOff(value: boolean): string {
	return value ? "on" : "off";
}
