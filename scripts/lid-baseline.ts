// Runs the TS/tongue other-language pipeline over eval/corpus.jsonl, producing a baseline for examples/lid_eval.rs.
// Usage: NODE_ENV=test node scripts/lid-baseline.ts eval/corpus.jsonl > eval/tongue.jsonl
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { LanguageEnum } from "../src/enums/Language.ts";
import { logger } from "../src/logger.ts";
import { detectLanguageOutsideOfEnRu } from "../src/slices/LangDay/detectOtherLanguages/detectOtherLanguages.ts";
import { detectAnyLanguage } from "../src/slices/LangDay/languageDetection.ts";
import { stripNonLetterOrWhitespaceChars } from "../src/slices/LangDay/utils.ts";

// Same as MIN_MSG_LENGTH in LangDay middleware
const MIN_MSG_LENGTH = 5;

for await (const line of createInterface({ input: createReadStream(process.argv[2] ?? "eval/corpus.jsonl") })) {
	const { id, text } = JSON.parse(line);
	const cleaned = stripNonLetterOrWhitespaceChars(text);
	let verdict = "ok";
	if (cleaned.length < MIN_MSG_LENGTH) {
		verdict = "skip";
	} else {
		const result = await detectLanguageOutsideOfEnRu(logger, cleaned, LanguageEnum.English);
		if (result?.mechanism === "charset") verdict = "charset";
		else if (result) verdict = `ml:${(await detectAnyLanguage(cleaned))?.language}`;
	}
	console.log(JSON.stringify({ id, verdict }));
}
