"use strict";

const bot = require("../bot");
const AdminValidator = require("../components/admin-validator");
const { adminCommand } = require("../command");

module.exports = {
  refreshAdmins: adminCommand(
    async function(msg) {
      let chatId = process.env.CHAT_ID;
      if (!chatId) {
        throw new Error("Refresh admins called without any ChatID.");
      }

      await AdminValidator._extendChatAdmins(process.env.CHAT_ID);
      let n = AdminValidator.nAdmins;
      bot.sendMessage(msg.chat.id,
        `Success. There are ${n} users with administrative access to the bot.`
      );
      return n;
    }
  ),
};
