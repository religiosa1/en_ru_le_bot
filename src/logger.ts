import pino, { type LevelWithSilent } from "pino";
import { match } from "ts-pattern";

export const logger = pino({
	level: match(process.env.NODE_ENV)
		.with("production", () => getEnvLogLevel() ?? "info")
		.with("test", () => "silent")
		.otherwise(() => getEnvLogLevel() ?? "debug"),
});

function getEnvLogLevel(env = process.env.LOG_LEVEL): LevelWithSilent | undefined {
	if (!env) {
		return undefined;
	}
	if (!["fatal", "error", "warn", "info", "debug", "trace"].includes(env)) {
		throw new Error(`Unknown log level "${env}"`);
	}
	return env;
}
