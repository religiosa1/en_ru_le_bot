import { CronJob } from "cron";
import type { Api } from "grammy";
import { match } from "ts-pattern";
import type { DIContainerInternal } from "../../container.ts";
import { LanguageEnum } from "../../enums/Language.ts";
import { Time } from "../../enums/Time.ts";
import { logger as baseLogger } from "../../logger.ts";
import type { LangDayService } from "../LangDay/service.ts";

const DEFAULT_ON = true;

type AlarmServiceParams = Pick<DIContainerInternal, "langDayService" | "api" | "chatId">;
export class AlarmService implements Disposable {
	// readonly #beforeHandJob = new CronJob("00 55 23 * * *", () => this.#handleBeforeHand(), null, DEFAULT_ON);
	readonly #dayChangeJob = new CronJob("00 00 00 * * *", () => this.#handleDayChange(), null, DEFAULT_ON);
	readonly #langDayService: LangDayService;
	readonly #api: Api;
	readonly #chatId: number;
	readonly #logger = baseLogger.child({ scope: "alarm::service" });

	constructor({ langDayService, api, chatId }: AlarmServiceParams) {
		this.#langDayService = langDayService;
		this.#api = api;
		this.#chatId = chatId;
	}

	[Symbol.dispose](): void {
		this.setEnabled(false);
	}

	get isEnabled(): boolean {
		return this.#dayChangeJob.isActive;
	}

	setEnabled(value: boolean) {
		if (value) {
			// if (!this.#beforeHandJob.isActive) this.#beforeHandJob.start();
			if (!this.#dayChangeJob.isActive) this.#dayChangeJob.start();
		} else {
			// if (this.#beforeHandJob.isActive) this.#beforeHandJob.stop();
			if (this.#dayChangeJob.isActive) this.#dayChangeJob.stop();
		}
	}

	// async #handleBeforeHand(): Promise<void> {
	// 	try {
	// 		const currentDay = this.#langDayService.getDaySettings();
	// 		const futureDay = this.#langDayService.getDaySettings(new Date(Date.now() + 24 * Time.Hours).getDay());
	// 		if (!futureDay?.value || futureDay.forced) {
	// 			return;
	// 		}
	// 		const msg = match(currentDay?.value)
	// 			.with(LanguageEnum.Russian, () => "День сменится через 5 минут")
	// 			.otherwise(() => "The day will change in 5 minutes.");
	// 		await this.#api.sendMessage(this.#chatId, msg);
	// 	} catch (error) {
	// 		this.#logger.error({ error }, "Error while trying to issue before-hand day change warning");
	// 	}
	// }

	async #handleDayChange(): Promise<void> {
		try {
			// Just in case of some mishaps shifting current 30 minutes ahead
			const day = await this.#langDayService.getDaySettings(new Date(Date.now() + 30 * Time.Minutes).getDay());
			if (!day || day.forced) {
				return;
			}
			const msg: string = match(day.value)
				.with(LanguageEnum.English, () => "English Day has begun.")
				.with(LanguageEnum.Russian, () => "Начался русский день.")
				.with(undefined, () => "Free Day has begun.\nНачался свободный день.")
				.exhaustive();
			await this.#api.sendMessage(this.#chatId, msg);
		} catch (error) {
			this.#logger.error({ error }, "Error while trying to issue day change warning");
		}
	}
}
