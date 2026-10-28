// Labels raw message texts with tongue, to assess it as a grader for training data.
// Usage: node scripts/tongue-label.ts eval/grader-sample.jsonl > eval/grader-tongue.jsonl
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { detectAnyLanguage } from "../src/slices/LangDay/languageDetection.ts";

for await (const line of createInterface({ input: createReadStream(process.argv[2]) })) {
	const { id, text } = JSON.parse(line);
	const detection = await detectAnyLanguage(text);
	console.log(JSON.stringify({ id, language: detection?.language ?? null, confidence: detection?.confidence ?? 0 }));
}
