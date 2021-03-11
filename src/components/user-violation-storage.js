"use strict";

const redis = require("redis").createClient();

const { promisify } = require("util");
const getAsync = promisify(redis.get).bind(redis);

const defaultOpts = {
  redisPrefix: "violationcounter",
  expiration: 5,
};

class UserViolationStorage {
  constructor(opts) {
    this.opts = {...defaultOpts, ...opts};
  }

  /** redis key for number of violations registered for the user
  * @param {number} userId
  * @returns {string} redis key.
  */
  key_nViolation(userId) { return `${this.opts.redisPrefix}:user:${userId}`; }
  /** redis key for the usernId registered for the username
  * @param {string} username
  * @returns {string} redis key.
  */
  key_username(username) { return `${this.opts.redisPrefix}:username:${username}`; }

  getExpiration() {
    return +this.opts.expiration * 60;
  }

  /** @param {string} username Username for which query is performed.
   * @returns {Promise<number>} userId recorded fot the username, NaN if the username wasn't recorded. */
  async getUserIdByUsername(username) {
    let userid = await getAsync(this.key_username(username));
    return parseInt(userid, 10);
  }

  /** @param {number} userId Searched userId.
   * @returns {Promise<number>} Number of violations for the user or NaN if no such userid is present. */
  async getViolationData(userId) {
    let n = await getAsync(this.key_nViolation(userId));
    return parseInt(n, 10);
  }

  /** Register next violation of the user.
   * Incrementing violation counter and refreshing his username in the registry
   * @param {number} userId TG userId to register.
   * @param {string} username TG username to be recorded/refreshed for this user.
   * @returns {Promise<number>} Number of violations recorded for the user. */
  async register(userId, username) {
    if (!Number.isInteger(userId)) {
      throw new TypeError("UserId of the violating user must be an integer");
    }

    let cv = await this.getViolationData(userId);
    if (Number.isInteger(cv)) {
      cv++;
    } else {
      cv = 1;
    }

    redis.set(this.key_nViolation(userId), cv, "EX", this.getExpiration());

    if (username && typeof username === "string") {
      redis.set(this.key_username(username), userId, "EX", this.getExpiration());
    }

    return cv;
  }

  /** Remove violation data registered for the user. */
  async remove(userhandle) {
    let userId;
    if (typeof userhandle === "number") {
      userId = userhandle;
    } else {
      userId = await this.getUserIdByUsername(userhandle);
    }
    redis.del(this.key_nViolation(userId));
    // username is left to expire by itself
  }

  /** Remove all the data from the db, violations and usernames.
   * @returns {Promise<Boolean>} true on success */
  flush() {
    return new Promise(function(resolve, reject) {
      redis.flushdb(err => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
  }

  /** Returns data about all the violations registered */
  getAllViolations() {
    return new Promise(function(resolve, reject) {
      redis.keys(this.key_nViolation("*"), function (err, keys) {
        if (err) {
          reject(err);
        } else {
          resolve(keys);
        }
      });
    });
  }

  /** Returns data about all usernames registered */
  getAllUserNames() {
    return new Promise(function(resolve, reject) {
      redis.keys(this.key_username("*"), function (err, keys) {
        if (err) {
          reject(err);
        } else {
          resolve(keys);
        }
      });
    });
  }
}

module.exports = new UserViolationStorage();
