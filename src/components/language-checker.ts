"use strict";

import type { Message } from "node-telegram-bot-api";
import { add, isBefore } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";

import { LanguageEnum } from "~/enums/LanguageEnum";

// This entities are excluded from the message by the retrieveText function prior to the language check.
const PERMITTED_ENTITIES = new Set([
  "mention",
  "text_mention",
  "hashtag",
  "cashtag",
  "bot_command",
  "url",
  "email",
  "text_link",
  "phone_number",
]);

const allCharsRe = /[а-яА-Яa-zA-Z\u0370-\uDF00]/ug;

interface LanguageCheckerOpts {
  autolangday: boolean;
  /** cooldown in minutes */
  cooldown: number,
  russian_days: number[],
  english_days: number[],
  threshold: number,
  /**  How many wrong letters is permitted in a msg. */
  badCharThresh: number,
  muteEnabled: boolean,
}

const defaultOptions = {
  autolangday: true,
  cooldown: 2, // in minutes
  russian_days: [ 1, 3, 5 ],
  english_days: [ 2, 4, 6 ],
  threshold: 0.5,
  badCharThresh: 5, // How many wrong letters is permitted in a msg.
  muteEnabled: true,
};

class LanguageChecker {
  opts: LanguageCheckerOpts;
  timezone: string;
  forcedLang: LanguageEnum;
  cooldownTarget: Date;

  constructor(opts?: Partial<LanguageCheckerOpts>) {
    this.opts = {...defaultOptions, ...opts};
    this.timezone = process.env.TIMEZONE || "Europe/Berlin";
    this.forcedLang = LanguageEnum.NONE;
    this.cooldownTarget = new Date();
  }

  resetCooldown(): void {
    this.cooldownTarget = new Date();
  }

  cooldown(): void {
    if (Number.isFinite(this.opts.cooldown) && this.opts.cooldown > 0) {
      this.cooldownTarget = add(new Date(), { minutes: this.opts.cooldown});
    }
  }

  /** returns language for which violation has occured, NONE if everything is ok */
  check(msg: Message): LanguageEnum {
    if (!msg) { throw new Error("No message to check"); }
    if ( !this.opts.autolangday || isBefore(new Date(), this.cooldownTarget) ) {
      return LanguageEnum.NONE;
    }

    const txt = this.retrieveText(msg);

    if (this.isEnglishDay()) {
      return this.isEnglishText(txt) ? LanguageEnum.NONE : LanguageEnum.EN;
    }
    if (this.isRussianDay()) {
      return this.isRussianText(txt) ? LanguageEnum.NONE : LanguageEnum.RU;
    }
    return LanguageEnum.NONE;
  }

  localTime(): Date {
    return utcToZonedTime(new Date(), this.timezone);
  }

  day(): number {
    return this.localTime().getDay();
  }

  isEnglishDay(ignoreForceLang = false): boolean {
    if (ignoreForceLang) {
      return this.opts.english_days.includes(this.day());
    }
    if (this.forcedLang && this.forcedLang !== LanguageEnum.EN ) return false;
    return this.forcedLang === LanguageEnum.EN || this.opts.english_days.includes(this.day());
  }

  isRussianDay(ignoreForceLang = false): boolean {
    if (ignoreForceLang) {
      return this.opts.russian_days.includes(this.day());
    }
    if (this.forcedLang && this.forcedLang !== LanguageEnum.RU) return false;
    return this.forcedLang === LanguageEnum.RU || this.opts.russian_days.includes(this.day());
  }

  isEnglishText(txt: string): boolean {
    if (typeof txt !== "string") {
      return false;
    }
    const eng = (txt.match(/[a-zA-Z]/ug) || []).length;
    const all = (txt.match(allCharsRe) || []).length;
    if (all > 0) {
      return eng/all >= this.opts.threshold || (all - eng <= this.opts.badCharThresh);
    }
    return true;
  }

  isRussianText(txt: string): boolean {
    if (typeof txt !== "string") {
      return false;
    }
    const ru = (txt.match(/[а-яА-Я]/ug) || []).length;
    const all = (txt.match(allCharsRe) || []).length;
    if (all > 0) {
      return  ru/all >= this.opts.threshold || (all - ru <= this.opts.badCharThresh);
    }
    return true;
  }

  retrieveText(msg: Message): string {
    if (!msg) return "";
    if (Array.isArray(msg.entities) && typeof msg.text === "string") {
      let text = "";
      let i = 0;
      for (const entity of msg.entities) {
        if (
          Number.isInteger(entity.offset) &&
          Number.isInteger(entity.length) &&
          entity.offset + entity.length <= msg.text.length
        ) {
          if (PERMITTED_ENTITIES.has(entity.type)) {
            // omitting
            text += msg.text.slice(i, entity.offset);
          } else {
            // including for check
            text += msg.text.slice(i, entity.offset + entity.length);
          }
          i = entity.offset + entity.length;
        }
      }
      if (i < msg.text.length) {
        text += msg.text.slice(i, msg.text.length);
      }
      return text;
    }
    return msg.text ?? "";
  }
}

export default new LanguageChecker();
