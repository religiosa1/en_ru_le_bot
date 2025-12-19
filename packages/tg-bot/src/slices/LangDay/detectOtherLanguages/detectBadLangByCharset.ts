const nonLettersRe = /[^\p{L}]/gu;
const allowedScriptRe = /[\p{Script=Cyrillic}a-zA-ZïëöÏËÖ]/gu;

// List of common kaomoji (e.g. "") chars, which we filter out as well as
// non-letter characters (though they technically are)
const kaomojiChars = new Set("ツシシノººノㅇㅅㅇㅠㅠㅜㅜωツʘʘ");

/**
 * Detection of non-english and non-russian, based on letters script.
 * Should reliably detect languages like arabic or chinese, but has no luck
 * detecting languages with latin script.
 *
 * @returns true if non English or Russian, false otherwise
 */
export function detectBadLangByCharset(text: string): boolean {
	return !(isInTheCharset(text, allowedScriptRe) ?? true);
}

const cyrillicScriptRe = /[\p{Script=Cyrillic}]/gu;
export function checkTextIsMostlyCyrillic(text: string): boolean {
	return isInTheCharset(text, cyrillicScriptRe) ?? true;
}

interface IsInTheCharsetOpts {
	matchRate?: number;
}
function isInTheCharset(
	text: string,
	charsetRe: RegExp,
	{ matchRate = 0.95 }: IsInTheCharsetOpts = {},
): boolean | undefined {
	const onlyLetters = Iterator.from(text.replaceAll(nonLettersRe, ""))
		.filter((i) => !kaomojiChars.has(i))
		.toArray()
		.join("");
	if (onlyLetters.length === 0) return undefined;
	const nGoodChars = Iterator.from(onlyLetters).reduce((acc, c) => (c.match(charsetRe) ? acc + 1 : acc), 0);
	const goodCharsRate = nGoodChars / onlyLetters.length;
	return goodCharsRate >= matchRate;
}
