import type { Context } from "grammy";
import type { User } from "grammy/types";

/** Extract user from command match or text_entities.
 *
 * User can be supplied either as "at mention" in format "@username", or as a
 * "text mention" -- which is a separate entity in grammy ctx object (and API response).
 *
 * No extra data is available on the command.
 */
export function getUserMentionFromMatchCtx(ctx: Context): string | User | undefined {
	if (!ctx.match || !ctx.message) {
		return undefined;
	}
	const textMentions = ctx.entities().filter((i) => i.type === "text_mention");
	if (textMentions.length > 1) {
		throw new Error("Unexpected amount of text_mentions, must be one at most");
	}
	const [mention] = textMentions;
	// not a text mention, but a regular "@" mention.
	if (!mention) {
		return parseUsernameFromAtMention(ctx.match);
	}
	const mentionText = ctx.message.text?.substring(mention.offset, mention.offset + mention.length);
	if (mentionText !== ctx.match) {
		throw new Error("command match and mention text do not match");
	}
	return mention.user;
}

function parseUsernameFromAtMention(input: string | RegExpMatchArray | undefined): string | undefined {
	if (!input) {
		return undefined;
	}
	if (typeof input !== "string") {
		throw new TypeError("Got RegExpMatchArray instead of string");
	}
	input = input.trim();
	if (!input.startsWith("@")) {
		throw new Error("username mention must start from @");
	}
	return input.slice(1);
}
