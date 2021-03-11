import bot  from "~/bot";
import AdminValidator from "~/components/admin-validator";
import { adminCommand } from "~/command";
import type { Message } from "node-telegram-bot-api";

export const refreshAdmins = adminCommand(async function(msg: Message) {
  let chatId = process.env.CHAT_ID;
  if (!chatId) {
    throw new Error("Refresh admins called without any ChatID.");
  }

  await AdminValidator.extendChatAdmins(process.env.CHAT_ID);
  let n = AdminValidator.nAdmins;
  bot.sendMessage(msg.chat.id,
    `Success. There are ${n} users with administrative access to the bot.`
  );
  return n;
});
