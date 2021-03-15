import bot  from "~/bot";
import AdminValidator from "~/components/admin-validator";
import { adminCommand } from "~/command";
import type { Message } from "node-telegram-bot-api";

export const refreshAdmins = adminCommand(async function(msg: Message) {
  const chatId = process.env.CHAT_ID;
  if (!chatId) {
    throw new Error("Refresh admins called without any ChatID.");
  }

  await AdminValidator.extendChatAdmins(process.env.CHAT_ID);
  const n = AdminValidator.nAdmins;
  void bot.sendMessage(msg.chat.id,
    `Success. There are ${n} users with administrative access to the bot.`
  );
  return n;
});
