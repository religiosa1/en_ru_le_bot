const URL_RE = /\w{2,8}:\/\/[^\s]+/g;
/** Strips all non-letter or non-whitespace characters from a string.
 * Strips urls as well, if a member posted a link. */
export function stripNonLetterOrWhitespaceChars(text: string): string {
	const withoutUrls = text.replaceAll(URL_RE, "");
	return (
		withoutUrls
			// removing all ha-ha-s from the text first
			.replaceAll(/\b(?:h[ae]h?-?)+\b/gi, "") // latin
			.replaceAll(/(?:^|\s)(?:х[ае]х?-?)+(?=\s|$)/giu, "") // cyrillic; word boundaries don't work for whatever reason
			// removing all non-letter characters
			.replaceAll(/[^\p{L}\s]/gu, "")
			// smushing whitespaces together
			.replaceAll(/\s+/g, " ")
			.trim()
	);
}
