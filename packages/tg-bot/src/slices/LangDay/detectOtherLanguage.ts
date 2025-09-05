const nonLettersRe = /[^\p{L}]/gu;
const allowedScriptRe = /[\p{Script=Cyrillic}a-zA-ZïëöÏËÖ]/gu;

// List of common kaomoji (e.g. "") chars, which we filter out as well.
const kaomojiChars = new Set("ツシシノººノㅇㅅㅇㅠㅠㅜㅜωツʘʘ");

export function detectOtherLanguage(text: string): boolean {
	const onlyLetters = Iterator.from(text.replaceAll(nonLettersRe, ""))
		.filter((i) => !kaomojiChars.has(i))
		.toArray()
		.join("");
	if (onlyLetters.length === 0) return false;

	const allowedMatches = onlyLetters.match(allowedScriptRe) || [];
	return allowedMatches.length !== onlyLetters.length;
}
