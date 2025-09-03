const URL_RE = /\w{2,8}:\/\/[^\s]+/g;
/** Strips all non-letter or non-whitespace characters from a string.
 * Strips urls as well, if a member posted a link. */
export function stripNonLetterOrWhitespaceChars(text: string): string {
	const withoutUrls = text.replaceAll(URL_RE, "");
	return withoutUrls
		.replaceAll(/[^\p{L}\s]/gu, "")
		.replaceAll(/\s+/g, " ")
		.trim();
}
