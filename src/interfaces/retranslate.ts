import bot from "~/bot";
import { adminCommand } from "~/command";
import type { Message } from "node-telegram-bot-api";

export const retranslate = adminCommand((msg: Message) => {
  if (!msg || !msg.text || !process.env.CHAT_ID) return;
  let i = msg.text.indexOf(" ");
  let text = msg.text.slice(i + 1);
  bot.sendMessage(process.env.CHAT_ID, text);
});
