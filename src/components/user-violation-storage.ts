"use strict";

import redisModule from "redis";
const redis = redisModule.createClient();

import { promisify } from "util";

const getAsync = promisify(redis.get).bind(redis);

class UserViolationStorage {
  redisPrefix: string;
  expiration: number;

  constructor({
    redisPrefix = "violationcounter",
    expiration = 5,
  } = {}) {
    this.redisPrefix = redisPrefix;
    this.expiration = expiration;
  }

  /** redis key for number of violations registered for the user
   @returns redis key
  */
  key_nViolation(userId: number | "*"): string {
    return `${this.redisPrefix}:user:${userId}`;
  }

  /** redis key for the usernId registered for the username
  * @returns redis key
  */
  key_username(username: string): string {
    return `${this.redisPrefix}:username:${username}`;
  }

  getExpiration(): number {
    return this.expiration * 60;
  }

  /** @param username Username for which query is performed.
   * @returns userId recorded fot the username, NaN if the username wasn't recorded. */
  async getUserIdByUsername(username: string): Promise<number | undefined> {
    const userid = await getAsync(this.key_username(username));
    if (!userid) { return; }
    return parseInt(userid, 10);
  }

  /** @param userId Searched userId.
   * @returns Number of violations for the user or NaN if no such userid is present. */
  async getViolationData(userId: number): Promise<number | undefined> {
    const n = await getAsync(this.key_nViolation(userId));
    if (n == null) { return; }
    return parseInt(n, 10);
  }

  /** Register next violation of the user.
   * Incrementing violation counter and refreshing his username in the registry
   * @param {number} userId TG userId to register.
   * @param {string} username TG username to be recorded/refreshed for this user.
   * @returns {Promise<number>} Number of violations recorded for the user. */
  async register(userId: number, username: string) {
    if (!Number.isInteger(userId)) {
      throw new TypeError("UserId of the violating user must be an integer");
    }

    let cv = await this.getViolationData(userId);
    if (cv != null && Number.isInteger(cv)) {
      cv++;
    } else {
      cv = 1;
    }

    redis.set(this.key_nViolation(userId), cv.toString(), "EX", this.getExpiration());

    if (username && typeof username === "string") {
      redis.set(this.key_username(username), userId.toString(), "EX", this.getExpiration());
    }

    return cv;
  }

  /** Remove violation data registered for the user. */
  async remove(userhandle: string | number) {
    let userId;
    if (typeof userhandle === "number") {
      userId = userhandle;
    } else {
      userId = await this.getUserIdByUsername(userhandle);
    }
    if (userId == null) {
      return;
    }
    redis.del(this.key_nViolation(userId));
    // username is left to expire by itself
  }

  /** Remove all the data from the db, violations and usernames.
   * @returns {Promise<Boolean>} true on success */
  flush() {
    return new Promise((resolve, reject) => {
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
    return new Promise((resolve, reject) => {
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
    return new Promise((resolve, reject) => {
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

export default new UserViolationStorage();
