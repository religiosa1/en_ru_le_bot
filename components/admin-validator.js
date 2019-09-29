const bot = require("./bot");

class AdminValidator {
  static get staticAdmins() {
    if (process && process.env && typeof process.env.ADMINS === "string") {
      return process.env.ADMINS.split(/\s+/).map(i=>parseInt(i, 10));
    }
    return [];
  }

  constructor() {
    this.admins = new Set(AdminValidator.staticAdmins);

    if (process.env.CHAT_ID) {
      this._extendChatAdmins(process.env.CHAT_ID);
    }
  }

  isAdmin(userId) {
    return this.admins.has(userId);
  }

  validate(msg) {
    if (msg && msg.from && msg.from.id) {
      return this.isAdmin(msg.from.id);
    } else {
      return false;
    }
  }

  adminOnly(func) {
    let self = this;
    return function(msg, ...args) {
      if (self.validate(msg)) {
        return func(msg, ...args);
      } else {
        bot.sendMessage(msg.chat.id, "You have to be an admin to do that.");
      }
    };
  }

  _extendChatAdmins(chatId) {
    if (!chatId) {
      throw new TypeError("Expecting to get a chat id, from which to retrieve a list of admins!");
    }
    return bot.getChatAdministrators(chatId).then(members => {
      if (!Array.isArray(members)) {
        throw new Error(
          `Expecting to get an array of ChatMembers out of the getChatAdministrators api call,
           got '${typeof members}' instead`
        );
      }
      for (let m of members) {
        if (m && m.user && m.user.id) this.admins.add(m.user.id);
      }
      return null;
    }).catch(e => {
      console.error("Error has happened on retrieving chat admins", e);
    });
  }

  refreshAdmins() {
    let chatId = process.env.CHAT_ID;
    if (!chatId) {
      console.warn("Refresh admins called, without any ChatID, ommiting.");
      return;
    }
    this._extendChatAdmins(process.env.CHAT_ID).then(()=>{
      bot.sendMessage(chatId,
        `Success. There are ${this.admins.size} users with administrative access to the bot.`
      );
      return null;
    }).catch(()=>{
      bot.sendMessage(chatId,
        "Something went wrong during the update of chat admins. More info in the logs."
      );
    });
  }
}

const adminValidatorInstance = new AdminValidator();
Object.freeze(adminValidatorInstance);

module.exports = adminValidatorInstance;
