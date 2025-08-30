import type { BotCommandScope } from "grammy/types";
import { getConfig } from "./models/config.ts";

export const adminScope: BotCommandScope = {
	type: "chat_administrators",
	chat_id: getConfig().chatId,
};
