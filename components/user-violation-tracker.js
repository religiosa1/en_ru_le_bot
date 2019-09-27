const redis = require("redis").createClient();
const moment = require("moment");

const bot = require("./bot");

const {promisify} = require("util");
const getAsync = promisify(redis.get).bind(redis);


const options = {
  expiration: 30,
  nWarnings: 2,
  // In minutes. If it's less than 30 seconds or more than 266 days, telegram will ban a user forever.
  muteDuration: 3 * 60,
  userPrefix: "violationcounter:user",
};

function q(id) {
  id = Number(id);
  return `${options.userPrefix}:${id}`;
}

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
    let retval;
    let id = q(userId);
    let cv = await getAsync(id);
    cv = parseInt(cv, 10);

    if (Number.isInteger(cv)) {
      if (cv >= options.nWarnings) {
        console.log("Muting user", userId);
        redis.del(id);
        try {
          await mute(chatId, userId);
        } catch(e) {
          console.error(e);
        }
        retval = new UserViolationStatus(true, 0, "You're temporarily muted for a repeated violation.");
      } else {
        cv++;
        redis.set(id, cv, "EX", options.expiration * 60);
        retval = new UserViolationStatus(false, cv, `This is your ${cv} warning.
You will be automatically muted if you continue to violate language policies`);
      }
    } else {
      redis.set(id, "1", "EX", options.expiration * 60);
      retval = new UserViolationStatus(false, 1, "This is your first warning.");
    }

    return retval || new UserViolationStatus(false, 0, "");
  },

  flush(msg) {
    if (!msg || !msg.chat) return;
    redis.flushdb((err)=>{
      bot.sendMessage(msg.chat.id,
        err ? "Something went wrong: " + err :  "All violation data is removed"
      );
    });
  },

  muteDuration(msg, match) {
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
  },

  muteExpiration(msg, match) {
    if (!msg || !msg.chat) return;
    if (Array.isArray(match) && match.length > 1 && match[1]) {
      let time = match[1];
      if (time < 1) {
        bot.sendMessage(msg.chat.id, "Mute expiration should be 1 minute or longer.");
        return;
      }
      options.expiration = time;
      bot.sendMessage(msg.chat.id, `Mute expiration is now ${options.expiration} minutes.`);
    } else {
      bot.sendMessage(msg.chat.id, `Mute expiration is ${options.expiration} minutes.`);
    }
  },

  muteWarnings(msg, match) {
    if (!msg || !msg.chat) return;
    if (Array.isArray(match) && match.length > 1 && match[1]) {
      let n = parseInt(match[1], 10);
      if (!Number.isInteger(n) || n < 1) {
        bot.sendMessage(msg.chat.id, "Number of warnings should be an integer greater than 1.");
        return;
      }
      options.nWarnings = n;
      bot.sendMessage(msg.chat.id, `Give ${n} warnings prior to a mute now.`);
    } else {
      bot.sendMessage(msg.chat.id, "Number of warnings is " + options.nWarnings);
    }
  },

  muteScore(msg) {
    if (!msg || !msg.chat) return;
    // redis.keys(`${options.userPrefix}:*`, function (err, keys) {
    redis.keys("*", function (err, keys) {
      if (err) {
        bot.sendMessage(msg.chat.id, "Error: " + err);
        return;
      }
      bot.sendMessage(msg.chat.id, "Mute score: " + keys.join(";") );
      for (let i = 0; i < keys.length; i++) {
        console.log(i, keys[i]);
      }
    });
  },
};

Object.freeze(UserViolationTracker);
module.exports = UserViolationTracker;
