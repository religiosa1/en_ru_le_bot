/** Strips all non-letter or non-whitespace characters from a string */
export function stripNonLetterOrWhitespaceChars(text: string): string {
	return text.replaceAll(/[^\p{L}\s]/gu, "");
}
