import { Time } from "../enums/Time.ts";

const durationComponentMap = {
	d: Time.Days,
	h: Time.Hours,
	m: Time.Minutes,
	s: Time.Seconds,
	ms: 1,
} as const;
type DurationPrefix = keyof typeof durationComponentMap;

export function formatDuration(durationInMs: number, maxComponents = 3): string {
	if (!Number.isFinite(durationInMs)) {
		throw new Error(`bad duration value ${durationInMs}`);
	}
	let result = durationInMs < 0 ? "-" : "";
	let nComponents = 0;
	let absDuration = Math.abs(durationInMs);
	for (const [suffix, value] of Object.entries(durationComponentMap)) {
		if (absDuration < value) {
			continue;
		}
		if (++nComponents > maxComponents) {
			break;
		}
		const unitValue = Math.floor(absDuration / value);
		if (unitValue) {
			result += unitValue + suffix;
		}
		absDuration = absDuration % value;
	}
	return result;
}

export function parseDuration(str: string, defaultGranularity?: DurationPrefix): number {
	if (defaultGranularity && !Object.keys(durationComponentMap).includes(defaultGranularity)) {
		throw new TypeError(`Invalid default duration granularity "${defaultGranularity}"`);
	}
	if (str === "0") {
		return 0;
	}
	// Handle plain numbers with default granularity
	if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(str)) {
		return defaultGranularity ? +str * durationComponentMap[defaultGranularity] : NaN;
	}

	// Parse duration strings with suffixes - handle negative sign at start
	const isNegative = str.startsWith("-");
	const workingStr = isNegative ? str.slice(1) : str;

	const regex = /((?:\d+(?:\.\d+)?|\.\d+))(ms|d|h|m|s)/g;
	const matches = Array.from(workingStr.matchAll(regex));

	if (!matches.length) {
		return NaN;
	}

	// Check if the entire string was consumed by matches -- aka we don't have some extra invalid crap
	if (matches.map((m) => m[0]).join("") !== workingStr) {
		return NaN;
	}

	let totalMs = 0;
	let lastComponentValue = Number.MAX_SAFE_INTEGER;

	for (const match of matches) {
		const [, valueStr, suffix] = match;

		if (!valueStr || !suffix || !Object.keys(durationComponentMap).includes(suffix)) {
			continue;
		}

		const componentValue = durationComponentMap[suffix as DurationPrefix];

		// Check if components are in descending order
		if (componentValue >= lastComponentValue) {
			return NaN;
		}
		lastComponentValue = componentValue;

		const value = parseFloat(valueStr);
		if (Number.isNaN(value)) continue;

		totalMs += value * componentValue;
	}

	return isNegative ? -totalMs : totalMs;
}
