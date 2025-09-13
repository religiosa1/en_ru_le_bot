import type { NextFunction } from "grammy";
import type { User } from "grammy/types";
import type { BotContext } from "../BotContext.ts";

/** Middleware for filtering new user joined */
export async function userJoined(ctx: BotContext, next: NextFunction): Promise<void> {
	const user = getNewUserFromChatMemberEvent(ctx);
	if (user) {
		await next();
	}
}

/** Analyzes chat_member event and tries to determine, if it's a new user joined */
export function getNewUserFromChatMemberEvent(ctx: BotContext): User | undefined {
	const member = ctx.update.chat_member?.new_chat_member;
	const oldMember = ctx.update.chat_member?.old_chat_member;
	if (!member || member.status !== "member" || (oldMember != null && oldMember.status !== "left")) {
		return;
	}
	return member.user;
}
