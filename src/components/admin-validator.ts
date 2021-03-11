import bot, { MessageHandler } from "../bot";
import type { Message } from "node-telegram-bot-api";

class AdminValidator {
  admins: Set<number>;

  getStaticAdmins(): number[] {
    if (process && process.env && typeof process.env.ADMINS === "string") {
      return process.env.ADMINS.split(/\s+/).map(i=>parseInt(i, 10));
    }
    return [];
  }

  constructor() {
    this.admins = new Set<number>(this.getStaticAdmins());
    this.adminOnly = this.adminOnly.bind(this);

    if (process.env.CHAT_ID) {
      this.extendChatAdmins(process.env.CHAT_ID);
    }
  }

  get nAdmins(): number {
    return this.admins.size;
  }

  isAdmin(userId: number): boolean {
    return this.admins.has(userId);
  }

  validate(msg: Message) {
    if (msg && msg.from && msg.from.id) {
      return this.isAdmin(msg.from.id);
    } else {
      return false;
    }
  }

  adminOnly<T = void>(func: MessageHandler<T>): MessageHandler<T | undefined> {
    let self = this;
    return async function(msg: Message, ...args: any[]) {
      if (self.validate(msg)) {
        return func(msg, ...args);
      } else {
        bot.sendMessage(msg.chat.id, "You have to be an admin to do that.");
      }
    };
  }

  extendChatAdmins(chatId?: string | number) {
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

  refreshAdmins(msg: Message) {
    if (!msg || !msg.chat || !msg.chat.id) return;
    let chatId = process.env.CHAT_ID;
    if (!chatId) {
      console.warn("Refresh admins called, without any ChatID, ommiting.");
      return;
    }
    this.extendChatAdmins(process.env.CHAT_ID).then(()=>{
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

export default adminValidatorInstance;
