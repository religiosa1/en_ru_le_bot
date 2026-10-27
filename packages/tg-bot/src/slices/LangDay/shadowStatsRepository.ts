import type { GlideClient } from "@valkey/valkey-glide";
import { COMMON_KEY_PREFIX } from "../../constants.ts";
import type { DIContainerInternal } from "../../container.ts";
import { isLangEnum, type LanguageEnum } from "../../enums/Language.ts";
import { Time } from "../../enums/Time.ts";

/** Final decision of the language check pipeline for a message */
export type Verdict = LanguageEnum | "other" | "mixed" | "unchecked";

/** Language check outcome by each detector, for a single message */
export interface Comparison {
	target: LanguageEnum | undefined;
	lingua: Verdict;
	tongue: Verdict;
}

export interface ShadowStats {
	compared: number;
	verdictsAgreed: number;
	/** Messages, where both detectors agree on whether the bot should react */
	actionsAgreed: number;
	linguaActed: number;
	tongueActed: number;
	disagreements: Array<Comparison & { count: number }>;
}

export const SHADOW_STATS_RETENTION_DAYS = 30;

const statsKey = (date: Date) => `${COMMON_KEY_PREFIX}langday:shadow:${date.toISOString().slice(0, 10)}`;

// Field is the comparison itself, e.g. "en:en:other", so counters stay a single HINCRBY
const FREE_DAY = "free";
const toField = ({ target, lingua, tongue }: Comparison) => [target ?? FREE_DAY, lingua, tongue].join(":");
function fromField(field: string): Comparison {
	const [target, lingua, tongue] = field.split(":") as [string, Verdict, Verdict];
	return { target: isLangEnum(target) ? target : undefined, lingua, tongue };
}

/** Whether the bot would warn about the message with this verdict */
export function wouldAct(verdict: Verdict, target: LanguageEnum | undefined): boolean {
	return verdict === "other" || (isLangEnum(verdict) && verdict !== target);
}

type ShadowStatsRepositoryParams = Pick<DIContainerInternal, "valkeyClient">;

/** Per day counters of lingua vs tongue language check outcomes */
export class ShadowStatsRepository {
	readonly #client: GlideClient;

	constructor({ valkeyClient }: ShadowStatsRepositoryParams) {
		this.#client = valkeyClient;
	}

	async record(comparison: Comparison, date = new Date()): Promise<void> {
		const key = statsKey(date);
		await this.#client.hincrBy(key, toField(comparison), 1);
		await this.#client.expire(key, (SHADOW_STATS_RETENTION_DAYS * Time.Days) / Time.Seconds);
	}

	/** Stats over the last `days` UTC days, including today */
	async getStats(days: number, now = Date.now()): Promise<ShadowStats> {
		const dates = Array.from({ length: days }, (_, i) => new Date(now - i * Time.Days));
		const hashes = await Promise.all(dates.map((date) => this.#client.hgetall(statsKey(date))));

		const counts = new Map<string, number>();
		for (const { field, value } of hashes.flat()) {
			counts.set(field.toString(), (counts.get(field.toString()) ?? 0) + Number(value));
		}

		const stats: ShadowStats = {
			compared: 0,
			verdictsAgreed: 0,
			actionsAgreed: 0,
			linguaActed: 0,
			tongueActed: 0,
			disagreements: [],
		};
		for (const [field, count] of counts) {
			const comparison = fromField(field);
			const linguaActs = wouldAct(comparison.lingua, comparison.target);
			const tongueActs = wouldAct(comparison.tongue, comparison.target);
			stats.compared += count;
			if (linguaActs) stats.linguaActed += count;
			if (tongueActs) stats.tongueActed += count;
			if (linguaActs === tongueActs) stats.actionsAgreed += count;
			if (comparison.lingua === comparison.tongue) stats.verdictsAgreed += count;
			else stats.disagreements.push({ ...comparison, count });
		}
		stats.disagreements.sort((a, b) => b.count - a.count);
		return stats;
	}
}
