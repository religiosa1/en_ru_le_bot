const moment = require("moment");

const bot = require("./bot");
const UserViolationTracker = require("./user-violation-tracker");
const AdminValidator = require("./admin-validator");
const messages = require("../messages");

function onoff(val) {
  return val ? "on":"off";
}

const allCharsRe = /[а-яА-Яa-zA-Z\u0370-\uDF00]/ug;

class LanguageChecker {

  static get defaultOpts() {
    return {
      autolangday: true,
      cooldown: 2, // in minutes
      russian_days: [1,3,5],
      english_days: [2,4,6],
      threshold: 0.5,
      badCharThresh: 5, // How many wrong letters is permitted in a msg.
      muteEnabled: true,
    };
  }

  constructor(opts) {
    this.opts = {...LanguageChecker.defaultOpts, ...opts};
    this.forcedLang = null;
    this.cooldownTarget = moment();
  }

  // ----------------------------------
  // commannds

  autolangday(msg) {
    if (!msg || !msg.chat) return;
    this.opts.autolangday = !this.opts.autolangday;
    let resp = "Autolangday is now " + onoff(this.opts.autolangday);
    bot.sendMessage(msg.chat.id, resp);
  }

  forcelangstatus(msg) {
    if (!msg || !msg.chat) return;
    if (!this.forcedLang) {
      bot.sendMessage(msg.chat.id, "No language is forced.");
    } else {
      bot.sendMessage(msg.chat.id, `Forced laguage is ${this.forcedLang}.`);
    }
  }

  forcelang(msg, match) {
    if (!msg || !msg.chat) return;
    if (Array.isArray(match) && match.length > 1 && match[1]) {
      let lang = match[1];
      if (lang.toUpperCase() === "EN") {
        this.forcedLang = "EN";
      } else if (lang.toUpperCase() === "RU") {
        this.forcedLang = "RU";
      } else {
        this.forcedLang = null;
      }
      bot.sendMessage(
        msg.chat.id,
        `${this.forcedLang? this.forcedLang: "No"} language is now forced.`
      );
    } else {
      this.forcelangstatus(msg);
    }
  }

  cooldownInfo(msg) {
    if (!msg || !msg.chat) return;
    let now = moment();
    let text = `Cooldown in minutes: ${this.opts.cooldown}. `;
    if (this.cooldownTarget < now) {
      text +=  "Next violation will get a warning";
    } else {
      let diff = this.cooldownTarget.diff(now, "minutes");
      if (diff === 0) {
        text += "You have less then a minute without a warning.";
      } else {
        text += `You have ${diff} ${diff === 1? "minute" : "minutes"} before a further warning.`;
      }
    }
    bot.sendMessage(msg.chat.id, text);
  }

  setCooldown(msg, match) {
    if (!msg || !msg.chat) return;
    if (Array.isArray(match) && match.length > 1 && match[1]) {
      let cd = parseInt(match[1].trim(), 10);
      if (cd >= 1 && cd <= 150) {
        this.opts.cooldown = cd;
        bot.sendMessage(msg.chat.id, `Cooldown is now ${cd} minutes.`);
      } else {
        bot.sendMessage(msg.chat.id, "Strange cooldown, can't do");
      }
    } else {
      this.cooldownTarget = moment();
      bot.sendMessage(msg.chat.id, "Cooldown's been reseted.");
    }
  }

  threshold(msg, match) {
    if (!msg || !msg.chat) return;
    if (Array.isArray(match) && match.length > 1 && match[1]) {
      let th = parseFloat(match[1]);
      if (th < 0 || th > 1) {
        bot.sendMessage(msg.chat.id, "Threshold must be between 0 and 1");
        return;
      }
      this.opts.threshold = th;
      bot.sendMessage(msg.chat.id, `Threshold is set to ${th}`);
    } else {
      bot.sendMessage(msg.chat.id, `Threshold is ${this.opts.threshold}`);
    }
  }

  today(msg) {
    if (!msg || !msg.chat) return;
    let resp;
    if (!this.opts.autolangday) {
      resp = messages.langday_disabled;
    } else if (this.isEnglishDay()) {
      resp = messages.langday_english;
    } else if (this.isRussianDay()) {
      resp = messages.langday_russian;
    } else {
      resp = messages.langday_none;
    }
    bot.sendMessage(msg.chat.id, resp);
  }

  toggleMuteCapacity(msg) {
    if (!msg || !msg.chat) return;
    this.opts.muteEnabled = !this.opts.muteEnabled;
    bot.sendMessage(msg.chat.id, "Mute capacity is now " + onoff(this.opts.muteEnabled));
  }

  // ----------------------------------
  // methods

  resetCooldown() {
    this.cooldownTarget = moment().add(this.opts.cooldown, "minutes");
  }

  lang_violation(msg, resp) {
    this.resetCooldown();
    bot.sendMessage(msg.chat.id, resp, {
      reply_to_message_id: msg.message_id,
    });
  }

  async check(msg) {
    if (!msg || !msg.chat || !this.opts.autolangday || moment().isBefore(this.cooldownTarget)) {
      return;
    }

    let txt = LanguageChecker.retrieveText(msg);
    let violationText = null;

    if (this.isEnglishDay() && !this.isEnglishText(txt)) {
      violationText = messages.langday_violation_english;
    } else if (this.isRussianDay() && !this.isRussianText(txt)) {
      violationText = messages.langday_violation_russian;
    }

    if (violationText) {
      if (this.opts.muteEnabled && msg.from && msg.from.id && !AdminValidator.isAdmin(msg.from.id)) {
        let response = await UserViolationTracker.register(msg.chat.id, msg.from.id);
        console.log(response, response.message);
        violationText += "\n" + response.message;
      }
      this.lang_violation(msg, violationText);
    }
  }

  isEnglishDay() {
    if (this.forcedLang && this.forcedLang !== "EN") return false;
    return this.forcedLang === "EN" || this.opts.english_days.includes(moment().day());
  }

  isRussianDay() {
    if (this.forcedLang && this.forcedLang !== "RU") return false;
    return this.forcedLang === "RU" || this.opts.russian_days.includes(moment().day());
  }

  isEnglishText(txt) {
    if (typeof txt !== "string") {
      return false;
    }
    let eng = (txt.match(/[a-zA-Z]/ug) || []).length;
    let all = (txt.match(allCharsRe) || []).length;
    if (all > 0) {
      return eng/all >= this.opts.threshold || (all - eng <= this.opts.badCharThresh);
    }
    return true;
  }

  isRussianText(txt) {
    if (typeof txt !== "string") {
      return false;
    }
    let ru = (txt.match(/[а-яА-Я]/ug) || []).length;
    let all = (txt.match(allCharsRe) || []).length;
    if (all > 0) {
      return  ru/all >= this.opts.threshold || (all - ru <= this.opts.badCharThresh);
    }
    return true;
  }

  static retrieveText(msg) {
    if (!msg) return "";
    if (Array.isArray(msg.entities) && typeof msg.text === "string") {
      let text = "";
      let i = 0;
      for (let e of msg.entities) {
        if (
          Number.isInteger(e.offset) &&
          Number.isInteger(e.length) &&
          e.offset + e.length <= msg.text.length
        ) {
          if (["bold", "italic"].includes(e.type)) {
            text += msg.text.slice(i, e.offset+e.length);
          } else {
            text += msg.text.slice(i, e.offset);
          }
          i = e.offset+e.length;
        }
      }
      if (i < msg.text.length) {
        text += msg.text.slice(i, msg.text.length);
      }
      return text;
    }
    return msg.text;
  }
}

const LanguageCheckerInstance = new LanguageChecker();

module.exports = LanguageCheckerInstance;
