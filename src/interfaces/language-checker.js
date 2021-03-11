"use strict";

const moment = require("moment");
const { CronJob } = require("cron");

const bot = require("../bot");
const { command, adminCommand, msgHandler } = require("../command");

const lngchk = require("../components/language-checker");
const UserViolation = require("./user-violation-interface");
const AdminValidator = require("../components/admin-validator");
const messages = require("../../messages");
const violation = require("../components/violation");

function onoff(val) {
  return val ? "on" : "off";
}

let notifications_enabled = true;
const notifications = {
  beforehand: new CronJob("0 55 23 * * *", function() {
    if (!notifications_enabled) return;

    let chatId = process.env.CHAT_ID;
    if (!chatId) return;

    bot.sendMessage( chatId, messages.notification_beforeHand);
  }, null, true, lngchk.timezone),

  main: new CronJob("0 00 00 * * *", function() {
    if (!notifications_enabled) return;

    let chatId = process.env.CHAT_ID;
    if (!chatId) return;

    let txt;
    if (lngchk.isEnglishDay(true)) {
      txt = messages.notification_main_en;
    } else if (lngchk.isRussianDay(true)) {
      txt = messages.notification_main_ru;
    } else {
      txt = messages.notification_main_free;
    }
    if (lngchk.forcedLang) {
      txt += messages.notification_main_forced;
    }
    bot.sendMessage( chatId, txt );
  }, null, true, lngchk.timezone),
};


module.exports = {
  notification: adminCommand(
    function(msg, match) {
      if (Array.isArray(match) && match.length > 1 && match[1]) {
        bot.sendMessage(msg.chat.id,  notifications_enabled ?
          "Notifications enabled" : "Notifications disabled"
        );
      } else {
        let act;
        if (notifications_enabled) {
          act = (item) => item && typeof item.stop === "function" && item.stop();
        } else {
          act = (item) => item && typeof item.start === "function" && item.start();
        }
        Object.values(notifications).forEach(act);
        notifications_enabled = !notifications_enabled;
        bot.sendMessage(msg.chat.id,
          `Notifications have been ${notifications_enabled ? "enabled" : "disabled"}`
        );
      }
    }
  ),

  today: command(
    function(msg) {
      let resp;

      if (lngchk.isEnglishDay(true)) {
        resp = messages.langday_english;
      } else if (lngchk.isRussianDay(true)) {
        resp = messages.langday_russian;
      } else {
        resp = messages.langday_none;
      }

      if (!lngchk.opts.autolangday) {
        resp += "\n" + messages.langday_disabled;
      } else if (lngchk.forcedLang === "EN") {
        resp += "\n" + messages.langday_forcedEn;
      } else if (lngchk.forcedLang === "RU") {
        resp += "\n" + messages.langday_forcedRu;
      }

      bot.sendMessage(msg.chat.id, resp);
    }
  ),

  cooldownInfo: command(
    function(msg) {
      let now = moment();
      let text = `Cooldown in minutes: ${lngchk.opts.cooldown}. `;
      if (lngchk.cooldownTarget < now) {
        text +=  "Next violation will get a warning";
      } else {
        let diff = lngchk.cooldownTarget.diff(now, "minutes");
        if (diff === 0) {
          text += "You have less then a minute without a warning.";
        } else {
          text += `You have ${diff} ${diff === 1? "minute" : "minutes"} before a further warning.`;
        }
      }
      bot.sendMessage(msg.chat.id, text);
    }
  ),

  autolangday: adminCommand(
    function(msg) {
      lngchk.opts.autolangday = !lngchk.opts.autolangday;
      bot.sendMessage(msg.chat.id, "Autolangday is now " + onoff(lngchk.opts.autolangday));
    }
  ),

  forcelang: adminCommand(
    function(msg, match) {
      if (Array.isArray(match) && match.length > 1 && match[1] && typeof match[1] === "string") {
        let lang = match[1].trim().toUpperCase();
        switch (lang) {
        case "EN":
          lngchk.forcedLang = "EN";
          break;
        case "RU":
          lngchk.forcedLang = "RU";
          break;
        default:
          lngchk.forcedLang = null;
        }
        bot.sendMessage(
          msg.chat.id,
          `${lngchk.forcedLang? lngchk.forcedLang : "No"} language is now forced.`
        );
      } else {
        if (!lngchk.forcedLang) {
          bot.sendMessage(msg.chat.id, "No language is forced.");
        } else {
          bot.sendMessage(msg.chat.id, `Forced language is ${lngchk.forcedLang}.`);
        }
      }
    }
  ),

  setCooldown: adminCommand(
    function(msg, match) {
      if (Array.isArray(match) && match.length > 1 && match[1]) {
        let cd = parseInt(match[1].trim(), 10);
        if (cd === 0) {
          lngchk.opts.cooldown = 0;
          bot.sendMessage(msg.chat.id, "Cooldown is disabled. Every violation gets a warning.");
        } else if (cd >= 1 && cd <= 150) {
          lngchk.opts.cooldown = cd;
          bot.sendMessage(msg.chat.id, `Cooldown is now ${cd} minutes.`);
        } else {
          bot.sendMessage(msg.chat.id, "Strange cooldown, can't do");
        }
      } else {
        lngchk.resetCooldown();
        bot.sendMessage(msg.chat.id, "Cooldown's been reset.");
      }
    }
  ),

  threshold: adminCommand(
    function(msg, match) {
      if (Array.isArray(match) && match.length > 1 && match[1]) {
        let th = parseFloat(match[1]);
        if (th < 0 || th > 1) {
          bot.sendMessage(msg.chat.id, "Threshold must be between 0 and 1");
          return;
        }
        lngchk.opts.threshold = th;
        bot.sendMessage(msg.chat.id, `Threshold is set to ${th}`);
      } else {
        bot.sendMessage(msg.chat.id, `Threshold is ${lngchk.opts.threshold}`);
      }
    }
  ),

  badChars: adminCommand(
    function(msg, match) {
      if (Array.isArray(match) && match.length > 1 && match[1]) {
        let cd = parseInt(match[1].trim(), 10);
        if (cd === 0) {
          lngchk.opts.badCharThresh = 0;
          bot.sendMessage(msg.chat.id, "No bad chars is allowed now.");
        } else if (cd >= 1 && cd <= 150) {
          lngchk.opts.badCharThresh = cd;
          bot.sendMessage(msg.chat.id, `Allowed number of bad chars is now ${cd}.`);
        } else {
          bot.sendMessage(msg.chat.id, "Strange number, can't do");
        }
      } else {
        bot.sendMessage(msg.chat.id, `The allowed number of bad chars in a message is ${lngchk.opts.badCharThresh}`);
      }
    }
  ),

  toggleMuteCapacity: adminCommand(
    function(msg) {
      lngchk.opts.muteEnabled = !lngchk.opts.muteEnabled;
      bot.sendMessage(msg.chat.id, "Mute capacity is now " + onoff(lngchk.opts.muteEnabled));
    }
  ),

  check: msgHandler(
    async function(msg) {
      let v = lngchk.check(msg);
      if (v === violation.NONE) return;

      let text;

      if (v === violation.EN) {
        text = messages.langday_violation_english;
      } else if (v === violation.RU) {
        text = messages.langday_violation_russian;
      }

      if (lngchk.opts.muteEnabled && msg.from && msg.from.id && !AdminValidator.isAdmin(msg.from.id)) {
        let response = await UserViolation.register(msg.chat.id, msg.from.id);
        // TODO proper handling of response
        text += "\n" + response.message;
      }

      lngchk.cooldown();
      bot.sendMessage(msg.chat.id, text, {
        reply_to_message_id: msg.message_id,
      });
    }
  ),
};
