import AdminValidator from "~/components/admin-validator";
import bot from "~/bot";
import { version as packageVersion } from "package.json";
import type { Message } from "node-telegram-bot-api";

import { adminCommand, command } from "~/command";

import messages from "messages";

function reply(msg: Message, txt: string) {
  if (!msg || !txt) return;
  const tid = (msg.chat && msg.chat.id) || (msg.from && msg.from.id);
  if (!tid) return;
  void bot.sendMessage(tid, txt);
}

export const info =  adminCommand((msg: Message) => {
  if (!msg.from) {
    throw new Error("No 'from' field in the message passed to the info function");
  }
  void bot.sendMessage(msg.from.id,`Your id is ${msg.from.id}, chat's id is ${msg.chat && msg.chat.id}`);
});

export const help = command((msg: Message) => {
  let text;
  if (AdminValidator.validate(msg)) {
    text = messages.help + messages.help_admin;
  } else {
    text = messages.help;
  }
  reply(msg, text);
});

export const rules = command( (msg: Message) => reply(msg, messages.rules) );

export const version = adminCommand( (msg: Message) => reply(msg, "Version: " + packageVersion) );