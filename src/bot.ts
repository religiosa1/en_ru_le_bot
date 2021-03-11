import TelegramBot from "node-telegram-bot-api";
import type { Message } from "node-telegram-bot-api";

const TOKEN = process.env.TELEGRAM_TOKEN;

if (!TOKEN) {
  console.error("Please supply TELEGRAM_TOKEN environment variable!");
  process.exit(1);
}

class LocalBot extends TelegramBot {
  get token(): string {
    return TOKEN!;
  }
}

export type MessageHandler<T = void> = (msg: Message, ...args: any[]) => Promise<T> | T

export default new LocalBot(TOKEN);
