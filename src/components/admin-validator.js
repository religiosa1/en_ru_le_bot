const bot = require("../bot");

class AdminValidator {
  getStaticAdmins() {
    if (process && process.env && typeof process.env.ADMINS === "string") {
      return process.env.ADMINS.split(/\s+/).map(i=>parseInt(i, 10));
    }
    return [];
  }

  constructor() {
    this.admins = new Set(this.getStaticAdmins());
    this.adminOnly = this.adminOnly.bind(this);

    if (process.env.CHAT_ID) {
      this._extendChatAdmins(process.env.CHAT_ID);
    }
  }

  get nAdmins() {
    return this.admins.size;
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
    return function(msg) {
      if (self.validate(msg)) {
        return func.apply(this, arguments);
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

  refreshAdmins(msg) {
    if (!msg || !msg.chat || !msg.chat.id) return;
    let chatId = process.env.CHAT_ID;
    if (!chatId) {
      console.warn("Refresh admins called, without any ChatID, ommiting.");
      return;
    }
    this._extendChatAdmins(process.env.CHAT_ID).then(()=>{
      bot.sendMessage(msg.chat.id,
        `Success. There are ${this.admins.size} users with administrative access to the bot.`
      );
      return null;
    }).catch(()=>{
      bot.sendMessage(msg.chat.id,
        "Something went wrong during the update of chat admins. More info in the logs."
      );
    });
  }
}

const adminValidatorInstance = new AdminValidator();
Object.freeze(adminValidatorInstance);

module.exports = adminValidatorInstance;
