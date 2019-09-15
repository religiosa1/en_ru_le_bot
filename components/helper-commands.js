const AdminValidator = require("./admin-validator").getInstance();
const bot = require("./bot").getInstance();
const pjson = require("../package.json");

const messages = require("../messages");

module.exports = {
  info(msg) {
    if (!msg) throw new Error("No message passed to the info function");
    if (!msg.from) throw new Error("No from field in the message passed to the info function");
    bot.sendMessage(msg.from.id,`Your id is ${msg.from.id}, chat's id is ${msg.chat && msg.chat.id}`);
  },

  help(msg) {
    if (!msg || !msg.chat || !msg.from) return;
    let text;
    if (AdminValidator.validate(msg)) {
      text = messages.help + messages.help_admin;
    } else {
      text = messages.help;
    }
    bot.sendMessage(msg.chat.id, text);
  },

  rules(msg) {
    if (!msg || !msg.chat) return;
    bot.sendMessage(msg.chat.id, messages.rules);
  },

  version(msg) {
    if (!msg || !msg.chat) return;
    bot.sendMessage(msg.chat.id, "Version: " + pjson.version);
  },
};
