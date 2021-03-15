import { CronJob } from "cron";
import bot from "~/bot";
import { command, adminCommand, msgHandler } from "~/command";
import lngchk from "~/components/language-checker";
import { differenceInMinutes } from "date-fns";

import { register } from "./user-violation-interface";

import AdminValidator from "~/components/admin-validator";
import messages from "messages";
import { LanguageEnum } from "~/enums/LanguageEnum";
import type { Message } from "node-telegram-bot-api";

function onoff(val: boolean): string {
  return val ? "on" : "off";
}

let notifications_enabled = true;
const notifications = {
  beforehand: new CronJob("0 55 23 * * *", function() {
    if (!notifications_enabled) return;

    const chatId = process.env.CHAT_ID;
    if (!chatId) return;

    void bot.sendMessage( chatId, messages.notification_beforeHand);
  }, null, true, lngchk.timezone),

  main: new CronJob("0 00 00 * * *", function() {
    if (!notifications_enabled) return;

    const chatId = process.env.CHAT_ID;
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
    void bot.sendMessage( chatId, txt );
  }, null, true, lngchk.timezone),
};



export const notification = adminCommand((msg: Message, match: RegExpMatchArray) => {
  if (Array.isArray(match) && match.length > 1 && match[1]) {
    void bot.sendMessage(msg.chat.id,  notifications_enabled ?
      "Notifications enabled" : "Notifications disabled"
    );
  } else {
    let act;
    if (notifications_enabled) {
      act = (item: CronJob) => typeof item?.stop === "function" && item.stop();
    } else {
      act = (item: CronJob) => typeof item?.start === "function" && item.start();
    }
    Object.values(notifications).forEach(act);
    notifications_enabled = !notifications_enabled;
    void bot.sendMessage(msg.chat.id,
      `Notifications have been ${notifications_enabled ? "enabled" : "disabled"}`
    );
  }
});

export const today = command((msg: Message) => {
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
  } else if (lngchk.forcedLang === LanguageEnum.EN) {
    resp += "\n" + messages.langday_forcedEn;
  } else if (lngchk.forcedLang === LanguageEnum.RU) {
    resp += "\n" + messages.langday_forcedRu;
  }

  void bot.sendMessage(msg.chat.id, resp);
});

export const cooldownInfo = command((msg: Message) => {
  const now = new Date();
  let text = `Cooldown in minutes: ${lngchk.opts.cooldown}. `;
  if (lngchk.cooldownTarget < now) {
    text +=  "Next violation will get a warning";
  } else {
    const diff = differenceInMinutes(lngchk.cooldownTarget, now);
    if (diff === 0) {
      text += "You have less then a minute without a warning.";
    } else {
      text += `You have ${diff} ${diff === 1? "minute" : "minutes"} before a further warning.`;
    }
  }
  void bot.sendMessage(msg.chat.id, text);
});

export const autolangday = adminCommand((msg: Message) => {
  lngchk.opts.autolangday = !lngchk.opts.autolangday;
  void bot.sendMessage(msg.chat.id, "Autolangday is now " + onoff(lngchk.opts.autolangday));
});

export const forcelang = adminCommand((msg: Message, match: RegExpMatchArray) => {
  if (Array.isArray(match) && match.length > 1 && match[1] && typeof match[1] === "string") {
    const lang = match[1].trim().toUpperCase();
    switch (lang) {
    case "EN":
      lngchk.forcedLang = LanguageEnum.EN;
      break;
    case "RU":
      lngchk.forcedLang = LanguageEnum.RU;
      break;
    default:
      lngchk.forcedLang = LanguageEnum.NONE;
    }
    void bot.sendMessage(
      msg.chat.id,
      `${lngchk.forcedLang? lngchk.forcedLang : "No"} language is now forced.`
    );
  } else {
    if (!lngchk.forcedLang) {
      void bot.sendMessage(msg.chat.id, "No language is forced.");
    } else {
      void bot.sendMessage(msg.chat.id, `Forced language is ${lngchk.forcedLang}.`);
    }
  }
});

export const setCooldown = adminCommand((msg: Message, match: RegExpMatchArray) => {
  if (Array.isArray(match) && match.length > 1 && match[1]) {
    const cd = parseInt(match[1].trim(), 10);
    if (cd === 0) {
      lngchk.opts.cooldown = 0;
      void bot.sendMessage(msg.chat.id, "Cooldown is disabled. Every violation gets a warning.");
    } else if (cd >= 1 && cd <= 150) {
      lngchk.opts.cooldown = cd;
      void bot.sendMessage(msg.chat.id, `Cooldown is now ${cd} minutes.`);
    } else {
      void bot.sendMessage(msg.chat.id, "Strange cooldown, can't do");
    }
  } else {
    lngchk.resetCooldown();
    void bot.sendMessage(msg.chat.id, "Cooldown's been reset.");
  }
});

export const threshold = adminCommand((msg: Message, match: RegExpMatchArray) => {
  if (Array.isArray(match) && match.length > 1 && match[1]) {
    const th = parseFloat(match[1]);
    if (th < 0 || th > 1) {
      void bot.sendMessage(msg.chat.id, "Threshold must be between 0 and 1");
      return;
    }
    lngchk.opts.threshold = th;
    void bot.sendMessage(msg.chat.id, `Threshold is set to ${th}`);
  } else {
    void bot.sendMessage(msg.chat.id, `Threshold is ${lngchk.opts.threshold}`);
  }
});

export const badChars = adminCommand((msg: Message, match: RegExpMatchArray) => {
  if (Array.isArray(match) && match.length > 1 && match[1]) {
    const cd = parseInt(match[1].trim(), 10);
    if (cd === 0) {
      lngchk.opts.badCharThresh = 0;
      void bot.sendMessage(msg.chat.id, "No bad chars is allowed now.");
    } else if (cd >= 1 && cd <= 150) {
      lngchk.opts.badCharThresh = cd;
      void bot.sendMessage(msg.chat.id, `Allowed number of bad chars is now ${cd}.`);
    } else {
      void bot.sendMessage(msg.chat.id, "Strange number, can't do");
    }
  } else {
    void bot.sendMessage(msg.chat.id, `The allowed number of bad chars in a message is ${lngchk.opts.badCharThresh}`);
  }
});

export const toggleMuteCapacity = adminCommand((msg: Message) => {
  lngchk.opts.muteEnabled = !lngchk.opts.muteEnabled;
  void bot.sendMessage(msg.chat.id, "Mute capacity is now " + onoff(lngchk.opts.muteEnabled));
});

export const check = msgHandler(async (msg: Message) => {
  const v = lngchk.check(msg);
  if (v === LanguageEnum.NONE) return;

  let text;

  if (v === LanguageEnum.EN) {
    text = messages.langday_violation_english;
  } else if (v === LanguageEnum.RU) {
    text = messages.langday_violation_russian;
  } else {
    text = "";
  }

  if (lngchk.opts.muteEnabled && msg.from && msg.from.id && !AdminValidator.isAdmin(msg.from.id)) {
    const response = await register(msg.chat.id, msg.from.id);
    // TODO proper handling of response
    text += "\n" + response.message;
  }

  lngchk.cooldown();
  void bot.sendMessage(msg.chat.id, text, {
    reply_to_message_id: msg.message_id,
  });
});
