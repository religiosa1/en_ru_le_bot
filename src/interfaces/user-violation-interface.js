const moment = require("moment");
const { command, adminCommand } = require("../command");

const bot = require("../bot");
const UserViolationStorage = require("../components/user-violation-storage");

const options = {
  nWarnings: 2,
  // In minutes. If it's less than 30 seconds or more than 266 days, telegram will ban a user forever.
  muteDuration: 3 * 60,
};

function mute(chatId, userId) {
  return bot.restrictChatMember(chatId, userId, {
    until_date: moment().add(options.muteDuration, "minutes").unix(),
    permissions: {
      can_send_messages: false,
      can_send_media_messages: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
      can_invite_users: true,
    },
  });
}

class UserViolationStatus {
  constructor(isBlocked, nWarnings, message) {
    this.isBlocked = Boolean(isBlocked);
    this.nWarnings = Number(nWarnings);
    this.message = message.toString();
  }
}

const UserViolationTracker = {
  async register(chatId, userId) {
    let userInfo = await bot.getChatMember(chatId, userId);
    let cv = UserViolationStorage.register(userId, userInfo.user.username);
    let retval;
    if (cv >= options.nWarnings) {
      await mute(chatId, userId);
      UserViolationStorage.remove(userId);
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
  },

  pardon: command(
    async function(msg) {
      if (Array.isArray(msg.entities) && msg.entities.length > 1) {
        let ent  = msg.entities[1];
        let usertext = msg.text.slice(ent.offset + 1, ent.offset + ent.length);
        let handle;
        if (ent.type === "text_mention" && ent.user && ent.user.id) {
          handle = ent.user.id;
        } else if (ent.type === "mention" && msg.text) {
          handle = usertext;
        } else {
          throw new Error("Is that a user? Really strange user handle.");
        }
        await UserViolationStorage.remove(handle);
        bot.sendMessage(msg.chat.id, `Violations for the user @${usertext} removed.`);
      } else {
        await UserViolationStorage.flush();
        bot.sendMessage(msg.chat.id, "All violation data is removed");
      }
    },
    "Unable to pardon: "
  ),


  muteDuration: adminCommand(
    function(msg, match) {
      if (!msg || !msg.chat) return;
      if (Array.isArray(match) && match.length > 1 && match[1]) {
        let time = match[1];
        if (time < 1) {
          bot.sendMessage(msg.chat.id, "Mute duration should be 1 minute or longer.");
          return;
        }
        options.muteDuration = time;
        bot.sendMessage(msg.chat.id, `Mute duration is now ${options.muteDuration} minutes`);
      } else {
        bot.sendMessage(msg.chat.id, `Mute duration is ${options.muteDuration} minutes.`);
      }
    }
  ),

  muteExpiration: adminCommand(
    function(msg, match) {
      if (Array.isArray(match) && match.length > 1 && match[1]) {
        let time = match[1];
        if (time < 1) { throw new Error("Mute expiration should be 1 minute or longer."); }
        UserViolationStorage.expiration = time;
        bot.sendMessage(msg.chat.id, `Mute expiration is now ${UserViolationStorage.expiration} minutes.`);
      } else {
        bot.sendMessage(msg.chat.id, `Mute expiration is ${UserViolationStorage.expiration} minutes.`);
      }
    }
  ),

  muteWarnings: adminCommand(
    function(msg, match) {
      if (!msg || !msg.chat) return;
      if (Array.isArray(match) && match.length > 1 && match[1]) {
        let n = parseInt(match[1], 10);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error("Number of warnings should be an integer greater than 1.");
        }
        options.nWarnings = n;
        bot.sendMessage(msg.chat.id, `Give ${n} warnings prior to a mute now.`);
      } else {
        bot.sendMessage(msg.chat.id, "Number of warnings is " + options.nWarnings);
      }
    }
  ),

  muteScore: adminCommand(
    async function() {
      let score = await UserViolationStorage.getAllViolations();
      console.log(score);
    }
  ),
};

Object.freeze(UserViolationTracker);
module.exports = UserViolationTracker;
