module.exports = function(msg) {
  if (typeof this.sendMessage !== "function") throw new Error(
    "No sendMessage method on this of info. Did you forget to bind it to the bot prior to passing as callback?"
  );
  if (!msg) throw new Error("No message passed to the info function");
  if (!msg.from) throw new Error("No from field in the message passed to the info function");
  this.sendMessage(msg.from.id,`Your id is ${msg.from.id}, chat's id is ${msg.chat && msg.chat.id}`);
};
