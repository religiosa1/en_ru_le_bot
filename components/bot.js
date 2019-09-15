const TelegramBot = require("node-telegram-bot-api");
const TOKEN = process.env.TELEGRAM_TOKEN;

if (!TOKEN) {
  console.error("Please supply both TELEGRAM_TOKEN variables!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN);

module.exports = {
  get token() {
    return TOKEN;
  },
  getInstance() {
    return bot;
  },
};
