const TelegramBot = require('node-telegram-bot-api');

module.exports = class AdminValidator {
  static get staticAdmins() {
    return [
      227039625,
    ];
  }

  constructor(bot) {
    if (!bot || !(bot instanceof TelegramBot)) {
      throw new TypeError("TelegramBot should be parsed as the first argument to the constructor");
    }
    this.bot = bot;
    this.admins = AdminValidator.staticAdmins;
    if (process.env.CHAT_ID) {
      this._extendChatAdmins(process.env.CHAT_ID);
    }
  }

  validate(msg) {
    if (msg && msg.from && msg.from.id) {
      return this.admins.includes(msg.from.id);
    } else {
      return false;
    }
  }

  isAdmin(func) {
    let self = this;
    return function(msg, ...args) {
      if (self.validate(msg)) {
        return func(msg, ...args);
      } else {
        self.bot.sendMessage(msg.chat.id, 'You have to be an admin to do that.');
      }
    };
  }

  _extendChatAdmins(chatId) {
    if (!chatId)
      throw new TypeError("Expecting to get a chat id, from which to retrieve a list of admins!");
    let members = this.bot.getChatAdministrators(chatId);
    if (Array.isarray(members)) {
      for (let m of members) {
        if (m && m.user && m.user.id) this.admin.push(m.user.id);
      }
    }
  }
};
