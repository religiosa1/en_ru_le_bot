import { dedent } from "ts-dedent";

const mdContSymbol = Symbol.for("markdownString");

/** Markdown string is a boxed string with an additional symbol brand. */
export type MarkdownString = string & { [mdContSymbol]: true };

/**
 * Create a raw Markdown string. Strings like this won't be escaped by the md function,
 * and so must contain valid markdown markup.
 *
 * Passed values will be escaped, unless they were also created with this function
 */
export function rawMd(
	literalString: TemplateStringsArray,
	...values: ReadonlyArray<MarkdownString | string | number>
): MarkdownString;
export function rawMd(textContent: string): MarkdownString;
export function rawMd(
	literalString: TemplateStringsArray | string,
	...values: ReadonlyArray<MarkdownString | string | number>
) {
	return taggedFunction((v) => v as MarkdownString, literalString, ...values);
}

/**
 * Create a raw Markdown string.
 *
 * Passed text allows '_', '*', '~', '|' and '*', in values these chars are
 * also escaped (unless they're strings created by rawMd function).
 *
 * Passed string is also goes through dedent, so you can align left margin
 * with your code indentation.
 */
export function md(
	literalString: TemplateStringsArray,
	...values: ReadonlyArray<MarkdownString | string | number>
): MarkdownString;
export function md(textContent: string): MarkdownString;
export function md(
	literalString: TemplateStringsArray | string,
	...values: ReadonlyArray<MarkdownString | string | number>
): MarkdownString {
	const md = taggedFunction(escapeMdSpecialChars, literalString, ...values);
	const v = new String(dedent(md.toString())) as MarkdownString;
	v[mdContSymbol] = true;
	return v;
}

export function isMarkdownString(v: unknown): v is MarkdownString {
	if (v == null || typeof v !== "object") return false;
	return mdContSymbol in v;
}

//===

function taggedFunction(
	escaper: (v: string) => string,
	literalString: TemplateStringsArray | string,
	...values: ReadonlyArray<MarkdownString | string | number>
): MarkdownString {
	if (typeof literalString === "string") {
		const mdString = new String(escaper(literalString)) as MarkdownString; // boxing our string
		mdString[mdContSymbol] = true;
		return mdString;
	}
	let result = "";
	for (let i = 0; i < literalString.length; i++) {
		result += escaper(literalString[i] ?? "");
		if (i < values.length) {
			const v = values[i];
			if (isMarkdownString(v)) {
				result += v;
			} else {
				result += escapeMdValue(String(v));
			}
		}
	}

	const mdResult = new String(result) as MarkdownString; // creating boxed string
	mdResult[mdContSymbol] = true;

	return mdResult;
}

function escapeMdValue(input: string): string {
	return input.replaceAll(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

/** Escaped MD string, allowing some formatting characters -- '*', '_", etc. */
function escapeMdSpecialChars(input: string): string {
	return input.replaceAll(/[[\]()>#+\-={}.!\\]/g, "\\$&");
}
