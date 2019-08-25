const moment = require("moment");

const AbstractComponent = require("./abstract-component");
const messages = require("../messages");

module.exports = class LanguageChecker extends AbstractComponent {
  static get defaultOpts() {
    return {
      autolangday: true,
      cooldown: 2,
      russian_days: [1,3,5],
      english_days: [2,4,6],
      threshold: 0.5,
      engCharThresh: 5, // How many english letters is permitted in a russian msg.
    };
  }

  constructor(bot, opts) {
    super(bot);
    this.opts = {...LanguageChecker.defaultOpts, ...opts};
    this.forcedLang = null;
    this.cooldownTarget = moment();
  }

  autolangday(msg) {
    if (!msg || !msg.chat) return;
    this.opts.autolangday = !this.opts.autolangday;
    let resp = `Autolangday is now ${this.opts.autolangday? "on":"off"}`;
    this.bot.sendMessage(msg.chat.id, resp);
  }

  forcelangstatus(msg) {
    if (!msg || !msg.chat) return;
    if (!this.forcedLang) {
      this.bot.sendMessage(msg.chat.id, "No language is forced.");
    } else {
      this.bot.sendMessage(msg.chat.id, `Forced laguage is ${this.forcedLang}.`);
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
      this.bot.sendMessage(
        msg.chat.id,
        `${this.forcedLang? this.forcedLang: "No"} language is now forced.`
      );
    } else {
      this.forcelangstatus(msg);
    }
  }
  cooldownInfo(msg) {
    if (!msg || !msg.chat) return;
    this.bot.sendMessage(
      msg.chat.id,
      `Currnet time is ${moment().format("HH:mm:ss")}. Cooldown in minutes ${this.opts.cooldown},` +
      `untill ${this.cooldownTarget.format("HH:mm:ss")}.`
    );
  }
  setCooldown(msg, match) {
    if (!msg || !msg.chat) return;
    if (Array.isArray(match) && match.length > 1 && match[1]) {
      let cd = parseInt(match[1].trim(), 10);
      if (cd >= 1 && cd <= 150) {
        this.opts.cooldown = cd;
        this.bot.sendMessage(msg.chat.id, `Cooldown is now ${cd} minutes.`);
      } else {
        this.bot.sendMessage(msg.chat.id, "Strange cooldown, can't do");
      }
    } else {
      this.cooldownTarget = moment();
      this.bot.sendMessage(msg.chat.id, "Cooldown's been reseted.");
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
    this.bot.sendMessage(msg.chat.id, resp);
  }

  resetCooldown() {
    this.cooldownTarget = moment().add(this.opts.cooldown, "minutes");
  }

  lang_violation(msg, resp) {
    this.resetCooldown();
    this.bot.sendMessage(msg.chat.id, resp, {
      reply_to_message_id: msg.message_id,
    });
  }

  check(msg) {
    if (!msg || !msg.chat || !this.opts.autolangday || moment().isBefore(this.cooldownTarget)) {
      return;
    }
    if (this.isEnglishDay()) {
      if (!this.isEnglishText(LanguageChecker.retrieveText(msg))) {
        this.lang_violation(msg, messages.langday_violation_english);
      }
    } else if (this.isRussianDay()){
      if (!this.isRussianText(LanguageChecker.retrieveText(msg))) {
        this.lang_violation(msg, messages.langday_violation_russian);
      }
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
    console.log(txt);
    let eng = (txt.match(/[a-zA-Z]/g) || []).length;
    let all = (txt.match(/[а-яА-Яa-zA-Z]/g) || []).length;
    console.log(eng, all, all>0? eng/all:"n/a", this.opts.threshold);
    if (all > 0) {
      return eng/all > this.opts.threshold;
    }
    return true;
  }

  isRussianText(txt) {
    if (typeof txt !== "string") {
      return false;
    }
    let ru = (txt.match(/[а-яА-Я]/g) || []).length;
    let all = (txt.match(/[а-яА-Яa-zA-Z]/g) || []).length;
    if (all > 0) {
      return  ru/all > this.opts.threshold || (all - ru <= this.opts.engCharThresh);
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
};
