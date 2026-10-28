import type { NextFunction } from "grammy";
import type { ChatMember, User } from "grammy/types";
import type { BotContext } from "../BotContext.ts";

/** Middleware for filtering new user joined in the target chat */
export async function userJoinedTargetChat(ctx: BotContext, next: NextFunction): Promise<void> {
	const logger = ctx.getLogger("userJoinedTargetChat");
	const { chatId } = ctx.container;
	const currentChatId = ctx.update.chat_member?.chat.id;
	if (currentChatId !== chatId) {
		logger.debug(
			{ actualChatId: currentChatId, targetChatId: chatId },
			`Wrong chat, aborting following checks in middleware`,
		);
		return;
	}
	const user = getNewUserFromChatMemberEvent(ctx);
	if (user) {
		await next();
	}
}

const ALLOWED_OLD_STATUSES: ChatMember["status"][] = ["left", "kicked"];

/** Analyzes chat_member event and tries to determine, if it's a new user joined */
export function getNewUserFromChatMemberEvent(ctx: BotContext): User | undefined {
	const member = ctx.update.chat_member?.new_chat_member;
	const oldMember = ctx.update.chat_member?.old_chat_member;
	if (
		!member ||
		member.status !== "member" ||
		(oldMember != null && !ALLOWED_OLD_STATUSES.includes(oldMember.status))
	) {
		return;
	}
	return member.user;
}
