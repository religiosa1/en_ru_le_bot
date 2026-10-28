import type { BotCommandScope } from "grammy/types";
import { getConfig } from "./models/config.ts";

const chatId = getConfig().chatId;

export const members: BotCommandScope = {
	type: "chat",
	chat_id: chatId,
};

export const admins: BotCommandScope = {
	type: "chat_administrators",
	chat_id: chatId,
};
