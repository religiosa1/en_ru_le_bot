import { add } from "date-fns";
import { adminCommand } from "~/command";

import bot from "~/bot";
import type { Message } from "node-telegram-bot-api";
import UserViolationStorage from "~/components/user-violation-storage";

const options = {
  nWarnings: 3,
  // In minutes. If it's less than 30 seconds or more than 266 days, telegram will ban a user forever.
  muteDuration: 3 * 60,
};

function mute(chatId: number, userId: number): Promise<boolean> {
  return bot.restrictChatMember(chatId, userId.toString(), {
    until_date: add(new Date(), { minutes: options.muteDuration }).getTime(),
    can_send_messages: false,
    can_send_media_messages: false,
    can_send_polls: false,
    can_send_other_messages: false,
    can_add_web_page_previews: false,
    can_invite_users: true,
  });
}

class UserViolationStatus {
  constructor(
    public isBlocked: boolean,
    public nWarnings: number,
    public message: string
  ) {}
}

export async function register(chatId: number, userId: number): Promise<UserViolationStatus> {
  const userInfo = await bot.getChatMember(chatId, userId.toString());
  // TODO check this unknown stuff
  const cv = await UserViolationStorage.register(userId, userInfo.user.username ?? "unknown");
  let retval;
  if (cv >= options.nWarnings) {
    await mute(chatId, userId);
    void UserViolationStorage.remove(userId);
    retval = new UserViolationStatus(true, 0, "You're temporarily muted for a repeated violation.");
  } else if (cv === 1) {
    retval = new UserViolationStatus(false, 1, "This is your first warning.");
  } else {
    retval = new UserViolationStatus(
      false,
      cv,
      `This is your ${cv} warning.` +
      "You will be automatically muted if you continue to violate language policies"
    );
  }
  return retval;
}

export const pardon = adminCommand(async (msg: Message) => {
  if (Array.isArray(msg.entities) && msg.entities.length > 1) {
    const ent  = msg.entities[1];
    const usertext = msg.text?.slice(ent.offset + 1, ent.offset + ent.length) ?? "";
    let handle;
    if (ent.type === "text_mention" && ent.user && ent.user.id) {
      handle = ent.user.id;
    } else if (ent.type === "mention" && msg.text) {
      handle = usertext;
    } else {
      throw new Error("Is that a user? Really strange user handle.");
    }
    await UserViolationStorage.remove(handle);
    void bot.sendMessage(msg.chat.id, `Violations for the user @${usertext} removed.`);
  } else {
    await UserViolationStorage.flush();
    void bot.sendMessage(msg.chat.id, "All violation data is removed");
  }
}, "Unable to pardon: ");

export const muteDuration = adminCommand((msg: Message, match: RegExpMatchArray) => {
  if (!msg || !msg.chat) return;
  if (Array.isArray(match) && match.length > 1 && match[1]) {
    const time = parseInt(match[1], 10);
    if (time < 1) {
      void bot.sendMessage(msg.chat.id, "Mute duration should be 1 minute or longer.");
      return;
    }
    options.muteDuration = time;
    void bot.sendMessage(msg.chat.id, `Mute duration is now ${options.muteDuration} minutes`);
  } else {
    void bot.sendMessage(msg.chat.id, `Mute duration is ${options.muteDuration} minutes.`);
  }
});

export const muteExpiration = adminCommand((msg: Message, match: RegExpMatchArray) => {
  if (Array.isArray(match) && match.length > 1 && match[1]) {
    const time = parseInt(match[1], 10);
    if (time < 1) { throw new Error("Mute expiration should be 1 minute or longer."); }
    UserViolationStorage.expiration = time;
    void bot.sendMessage(msg.chat.id, `Mute expiration is now ${UserViolationStorage.expiration} minutes.`);
  } else {
    void bot.sendMessage(msg.chat.id, `Mute expiration is ${UserViolationStorage.expiration} minutes.`);
  }
});

export const muteWarnings = adminCommand((msg, match) => {
  if (!msg || !msg.chat) return;
  if (Array.isArray(match) && match.length > 1 && match[1]) {
    const n = parseInt(match[1], 10);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error("Number of warnings should be an integer greater than 1.");
    }
    options.nWarnings = n;
    void bot.sendMessage(msg.chat.id, `Give ${n} warnings prior to a mute now.`);
  } else {
    void bot.sendMessage(msg.chat.id, `Number of warnings is ${options.nWarnings}`);
  }
});

export const muteScore = adminCommand(async () => {
  console.log(await UserViolationStorage.getAllViolations());
});
