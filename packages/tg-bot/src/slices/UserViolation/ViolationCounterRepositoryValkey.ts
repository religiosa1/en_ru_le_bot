import assert from "node:assert/strict";
import { Batch, type GlideClient, Script, TimeUnit } from "@valkey/valkey-glide";
import { dedent as d } from "ts-dedent";
import { COMMON_KEY_PREFIX } from "../../constants.ts";
import { logger } from "../../logger.ts";
import { toNumber } from "../../utils/glideParsers.ts";
import type { ViolationCounterRepository } from "./models.ts";

const VIOLATIONS_PREFIX = COMMON_KEY_PREFIX + "violations:";

const USER_VIOLATIONS_KEY_PREFIX = `${VIOLATIONS_PREFIX}counter:`;
const userViolationKey = (userId: number) => `${USER_VIOLATIONS_KEY_PREFIX}${userId}`;
/**
 * Storing username to userId map here.
 *
 * This is stored along with userIdKey for a violation, if a user has username
 * (not all of them do), so we can lookup violations by username or userid.
 *
 * If a user has no username, we're just skipping this field, and storing only
 * the violation counter.
 */
const usernameToUserIdKey = (username: string) => `${VIOLATIONS_PREFIX}username:${username}`;
/**
 * Storing userId to userMap map here.
 *
 * Reverse map of userHandleKey.
 */
const userIdToUsernameKey = (userId: number) => `${VIOLATIONS_PREFIX}userid:${userId}`;

export class ViolationCounterRepositoryValkey implements ViolationCounterRepository {
	#client: GlideClient;

	constructor({ valkeyClient }: { valkeyClient: GlideClient }) {
		this.#client = valkeyClient;
	}

	async getViolationCount(userIdOrHandle: string | number): Promise<number | undefined> {
		const { userId } = (await this.#searchUser(userIdOrHandle)) ?? {};
		if (userId == null) {
			return undefined;
		}
		const count = await this.#client.get(userViolationKey(userId));
		return toNumber(count);
	}

	async registerViolation(userId: number, username: string | undefined, ttlMs: number): Promise<number> {
		if (!Number.isInteger(userId)) {
			throw new TypeError(`userId must be an integer, got ${userId}`);
		}
		if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
			throw new TypeError(`ttlMs must be a positive integer, got ${ttlMs}`);
		}

		const key = userViolationKey(userId);
		const transaction = new Batch(true) // Atomic (Transactional)
			.incr(key)
			.pexpire(key, ttlMs);

		if (username) {
			const expiry = this.#getExpiry(ttlMs);
			transaction.set(usernameToUserIdKey(username), userId.toString(), {
				expiry,
			});
			transaction.set(userIdToUsernameKey(userId), username, {
				expiry,
			});
		}

		const [val] = (await this.#client.exec(transaction, true)) ?? [];
		const value = toNumber(val?.toString());
		assert(value, "Some value should be returned from valkey");

		return value;
	}

	async removeViolation(userIdOrHandle: number | string): Promise<number | undefined> {
		const { userId, username } = (await this.#searchUser(userIdOrHandle)) ?? {};
		if (userId == null) {
			logger.info({ username: userIdOrHandle }, `Unable to find user with the provided username.`);
			return undefined;
		}

		const keysToDelete = [userViolationKey(userId), userIdToUsernameKey(userId)];
		if (username) {
			keysToDelete.push(usernameToUserIdKey(username));
		}
		const rowsAffected = await this.#client.del(keysToDelete);
		return rowsAffected ? userId : undefined;
	}

	async removeAllViolations(): Promise<number[]> {
		const userIds = await this.#client.invokeScript(ViolationCounterRepositoryValkey.removeAllViolationsLuaScript, {
			args: [VIOLATIONS_PREFIX + "*", USER_VIOLATIONS_KEY_PREFIX],
		});
		assert(Array.isArray(userIds), "RemoveAll script result type must be an array");
		return userIds as number[];
	}

	async #searchUser(
		userIdOrHandle: number | string,
	): Promise<{ userId: number; username: string | undefined } | undefined> {
		if (typeof userIdOrHandle === "number") {
			const userId = userIdOrHandle;
			const username = await this.#client.get(userIdToUsernameKey(userId));
			return { userId, username: username?.toString() };
		} else {
			const username = userIdOrHandle;
			const userId = toNumber(await this.#client.get(usernameToUserIdKey(username)));
			if (userId == null) return undefined;
			return { userId, username };
		}
	}

	#getExpiry(ttlMs: number) {
		return {
			type: TimeUnit.Milliseconds,
			count: ttlMs,
		};
	}

	private static readonly removeAllViolationsLuaScript = new Script(d`
		local userIds = {}
		local pattern = ARGV[1]
		local userIdPattern = ARGV[2]

		local cursor = "0"
		repeat
			local result = redis.call("SCAN", cursor, "MATCH", pattern, "COUNT", 100)
			cursor = result[1]
			local keys = result[2]
			
			if #keys > 0 then
				for i = 1, #keys do
					local key = keys[i]
					local deletedCount = redis.call("DEL", key)
					if deletedCount > 0 then
						-- Extract userId from keys like "violations:counter:123" 
						-- this works for one key specifically
						local userId = string.match(key, userIdPattern .. "(%d+)")
						if userId then
							table.insert(userIds, tonumber(userId))
						end
					end
				end
			end
		until cursor == "0"
		
		return userIds`);
}
