const nonLettersRe = /[^\p{L}]/gu;
const allowedScriptRe = /[\p{Script=Cyrillic}a-zA-ZïëöÏËÖ]/gu;

// List of common kaomoji (e.g. "") chars, which we filter out as well.
const kaomojiChars = new Set("ツシシノººノㅇㅅㅇㅠㅠㅜㅜωツʘʘ");

/**
 * Detection of non-english and non-russian, based on letters script.
 * Should reliably detect languages like arabic or chinese, but has no luck
 * detecting languages with latin script.
 *
 * @returns true if non English or Russian, false otherwise
 */
export function detectBadLangByCharset(text: string): boolean {
	const onlyLetters = Iterator.from(text.replaceAll(nonLettersRe, ""))
		.filter((i) => !kaomojiChars.has(i))
		.toArray()
		.join("");
	if (onlyLetters.length === 0) return false;

	const nGoodChars = Iterator.from(onlyLetters).reduce((acc, c) => (c.match(allowedScriptRe) ? acc + 1 : acc), 0);

	const goodCharsRate = nGoodChars / onlyLetters.length;
	// 95% of the text letters must be good, but no more than 5 bad chars
	return !(goodCharsRate > 0.9 && onlyLetters.length - nGoodChars < 5);
}
