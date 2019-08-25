const AbstractComponent = require("./abstract-component");
const AdminValidator = require("./admin-validator");
const messages = require("../messages");

module.exports = class HelperCommands extends AbstractComponent {

  constructor(bot, av) {
    super(bot);
    if (!av || !(av instanceof AdminValidator) ) {
      throw new TypeError("An AdminValidator instance should be passed as the second argument to the constructor");
    }
    this.av = av;
  }

  info(msg) {
    if (typeof this.sendMessage !== "function") throw new Error(
      "No sendMessage method on this of info. Did you forget to bind it to the bot prior to passing as callback?"
    );
    if (!msg) throw new Error("No message passed to the info function");
    if (!msg.from) throw new Error("No from field in the message passed to the info function");
    this.bot.sendMessage(msg.from.id,`Your id is ${msg.from.id}, chat's id is ${msg.chat && msg.chat.id}`);
  }

  help(msg) {
    if (!msg || !msg.chat || !msg.from) return;
    let text;
    if (this.av.validate(msg)) {
      text = messages.help + messages.help_admin;
    } else {
      text = messages.help;
    }
    this.bot.sendMessage(msg.chat.id, text);
  }

  rules(msg) {
    if (!msg || !msg.chat) return;
    this.bot.sendMessage(msg.chat.id, messages.rules);
  }
};
