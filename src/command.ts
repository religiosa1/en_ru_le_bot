import bot, { MessageHandler } from "./bot";
import type { Message } from "node-telegram-bot-api";

import adminValidator from "./components/admin-validator";

export function command<T = void>(
  fn: MessageHandler<T>,
  error_preambule: string = ""
): MessageHandler<T | undefined> {
  if (typeof fn !== "function") {
    throw new TypeError("Expecting to receieve a function handler to be decorated.");
  }
  return async function(msg: Message, ...args: any[]): Promise<T | undefined> {
    if (!msg || !msg.chat || !msg.chat.id) {
      console.error("Command didn't recieve a msg its argument or chat field is missing: ", msg);
      console.trace();
      return;
    }

    let retval;
    try {
      retval = await fn(msg, ...args);
    } catch(err: unknown) {
      console.error("ERROR: ", error_preambule, err);
      if (msg && msg.chat && msg.chat.id) {
        void bot.sendMessage(msg.chat.id, `${error_preambule}${err}` );
      }
    }
    return retval;
  };
}

export function adminCommand<T = void>(fn: MessageHandler<T>, error_preambule = ""): MessageHandler<T | undefined> {
  return adminValidator.adminOnly(command(fn, error_preambule));
}

// it's the same for now, but it's better to differentiate
export const msgHandler = command;