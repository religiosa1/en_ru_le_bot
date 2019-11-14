const bot = require("./bot");

module.exports = function (msg) {
  if (!msg || !msg.text || !process.env.CHAT_ID) return;
  let i = msg.text.indexOf(" ");
  let text = msg.text.slice(i + 1);
  bot.sendMessage(process.env.CHAT_ID, text);
};
