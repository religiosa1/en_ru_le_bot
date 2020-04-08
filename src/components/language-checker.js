const moment = require("moment-timezone");
const violation = require("./violation");

// This entities are excluded from the message by the retrieveText function prior to the language check.
const PERMITTED_ENTITIES = [
  "mention",
  "text_mention",
  "hashtag",
  "cashtag",
  "bot_command",
  "url",
  "email",
  "text_link",
  "phone_number",
];

const allCharsRe = /[а-яА-Яa-zA-Z\u0370-\uDF00]/ug;

const defaultOptions = {
  autolangday: true,
  cooldown: 2, // in minutes
  russian_days: [ 1, 5 ],
  english_days: [ 3, 0 ],
  threshold: 0.5,
  badCharThresh: 5, // How many wrong letters is permitted in a msg.
  muteEnabled: true,
};

class LanguageChecker {
  constructor(opts) {
    this.opts = {...defaultOptions, ...opts};
    this.timezone = process.env.TIMEZONE || "Europe/Berlin";
    this.forcedLang = null;
    this.resetCooldown();
  }

  resetCooldown() {
    this.cooldownTarget = moment();
  }

  cooldown() {
    if (Number.isFinite(this.opts.cooldown) && this.opts.cooldown > 0) {
      this.cooldownTarget = moment().add(this.opts.cooldown, "minutes");
    }
  }

  check(msg) {
    if (!msg) { throw new Error("No message to check"); }
    if ( !this.opts.autolangday || moment().isBefore(this.cooldownTarget) ) {
      return violation.NONE;
    }

    let txt = this.retrieveText(msg);

    if (this.isEnglishDay()) {
      return this.isEnglishText(txt) ? violation.NONE : violation.EN;
    }
    if (this.isRussianDay()) {
      return this.isRussianText(txt) ? violation.NONE : violation.RU;
    }
    return violation.NONE;
  }

  localTime() {
    return moment().tz(this.timezone);
  }

  day() {
    return this.localTime().day();
  }

  isEnglishDay(ignoreForceLang = false) {
    if (ignoreForceLang) {
      return this.opts.english_days.includes(this.day());
    }
    if (this.forcedLang && this.forcedLang !== "EN") return false;
    return this.forcedLang === "EN" || this.opts.english_days.includes(this.day());
  }

  isRussianDay(ignoreForceLang = false) {
    if (ignoreForceLang) {
      return this.opts.russian_days.includes(this.day());
    }
    if (this.forcedLang && this.forcedLang !== "RU") return false;
    return this.forcedLang === "RU" || this.opts.russian_days.includes(this.day());
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

  retrieveText(msg) {
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
          if (PERMITTED_ENTITIES.includes(e.type)) {
            // omitting
            text += msg.text.slice(i, e.offset);
          } else {
            // including for check
            text += msg.text.slice(i, e.offset+e.length);
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

module.exports = new LanguageChecker();
