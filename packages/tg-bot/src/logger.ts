import pino from "pino";
import { match } from "ts-pattern";

export const logger = pino({
	level: match(process.env.NODE_ENV)
		.with("production", () => "info")
		.with("test", () => "silent")
		.otherwise(() => "debug"),
});
