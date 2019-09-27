const TelegramBot = require("node-telegram-bot-api");
const TOKEN = process.env.TELEGRAM_TOKEN;

if (!TOKEN) {
  console.error("Please supply both TELEGRAM_TOKEN variables!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN);
Object.defineProperty(bot, "token", {
  enumerable: false,
  configurable: false,
  writable: false,
  value: TOKEN,
});

module.exports = bot;
