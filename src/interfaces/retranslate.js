"use strict";

const bot = require("../bot");
const { adminCommand } = require("../command");

module.exports = adminCommand(
  function(msg) {
    if (!msg || !msg.text || !process.env.CHAT_ID) return;
    let i = msg.text.indexOf(" ");
    let text = msg.text.slice(i + 1);
    bot.sendMessage(process.env.CHAT_ID, text);
  }
);
