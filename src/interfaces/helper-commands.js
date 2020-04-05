const AdminValidator = require("../components/admin-validator");
const bot = require("../bot");
const pjson = require("../../package.json");

const { adminCommand, command } = require("../command");

const messages = require("../../messages");

const reply = function(msg, txt) {
  if (!msg || !txt) return;
  let tid = (msg.chat && msg.chat.id) || (msg.from && msg.from.id);
  if (!tid) return;
  bot.sendMessage(tid, txt);
};

module.exports = {
  info: adminCommand(
    function(msg) {
      if (!msg.from) throw new Error("No 'from' field in the message passed to the info function");
      bot.sendMessage(msg.from.id,`Your id is ${msg.from.id}, chat's id is ${msg.chat && msg.chat.id}`);
    }
  ),

  help: command(
    function(msg) {
      let text;
      if (AdminValidator.validate(msg)) {
        text = messages.help + messages.help_admin;
      } else {
        text = messages.help;
      }
      reply(msg, text);
    }
  ),

  rules: command(
    function(msg) {
      if (!msg || !msg.chat) return;
      reply(msg, messages.rules);
    }
  ),

  version: adminCommand(
    function(msg) {
      reply(msg, "Version: " + pjson.version);
    }
  ),
};
