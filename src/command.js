"use strict";

const bot = require("./bot");
const { adminOnly } = require("./components/admin-validator");

const command = function(fn, error_preambule = "") {
  if (typeof fn !== "function") {
    throw new TypeError("Expecting to receieve a function handler to be decorated.");
  }
  return async function(msg) {
    if (!msg || !msg.chat || !msg.chat.id) {
      console.error("Command didn't recieve a msg its argument or chat field is missing: ", msg);
      console.trace();
      return;
    }

    let retval;
    try {
      retval = await fn.apply(this, arguments);
    } catch(err) {
      console.error("ERROR: ", error_preambule, err);
      if (msg && msg.chat && msg.chat.id) {
        bot.sendMessage(msg.chat.id, error_preambule + err.toString());
      }
    }
    return retval;
  };
};

const adminCommand = function(fn, error_preambule = "") {
  return adminOnly(command(fn, error_preambule));
};

module.exports = {
  command,
  adminCommand,
  msgHandler: command, // it's the same for now, but it's better to differentiate
};
