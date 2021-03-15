import bot from "~/bot";
import { adminCommand } from "~/command";
import type { Message } from "node-telegram-bot-api";

export const retranslate = adminCommand((msg: Message) => {
  if (!msg || !msg.text || !process.env.CHAT_ID) return;
  const i = msg.text.indexOf(" ");
  const text = msg.text.slice(i + 1);
  void bot.sendMessage(process.env.CHAT_ID, text);
});
