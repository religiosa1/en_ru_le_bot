const TelegramBot = require("node-telegram-bot-api");

module.exports = class AbstractComponent {
  constructor(bot) {
    if (!bot || !(bot instanceof TelegramBot)) {
      throw new TypeError("A TelegramBot instance should be passed as the first argument to the constructor");
    }
    this.bot = bot;
  }
};
