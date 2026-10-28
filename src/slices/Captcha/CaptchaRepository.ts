import { Batch, ExpireOptions, type GlideClient, type GlideString, Script, TimeUnit } from "@valkey/valkey-glide";
import { dedent as d } from "ts-dedent";
import { COMMON_KEY_PREFIX } from "../../constants.ts";
import type { DIContainerInternal } from "../../container.ts";
import { Time } from "../../enums/Time.ts";
import { toNumber } from "../../utils/glideParsers.ts";
import type { MemberVerification } from "./models.ts";

const VALUES_EXPIRATION = 1 * Time.Days;

const CAPTCHA_KEY_PREFIX = COMMON_KEY_PREFIX + "captcha:";

const userAskedQuestionKey = (userid: number) => `${CAPTCHA_KEY_PREFIX}question:${userid}`;
const userExpectedAnswerKey = (userid: number) => `${CAPTCHA_KEY_PREFIX}answer:${userid}`;
const userAttemptsMadeKey = (userid: number) => `${CAPTCHA_KEY_PREFIX}attempts_counter:${userid}`;
const userMsgIdsKey = (userid: number) => `${CAPTCHA_KEY_PREFIX}msg_ids:${userid}`;
const QUESTION_FIRST_ASKED_AT_PREFIX = `${CAPTCHA_KEY_PREFIX}first_asked_at:`;
const questionFirstAskedAtKey = (userid: number) => `${QUESTION_FIRST_ASKED_AT_PREFIX}${userid}`;
const usernameToUserIdKey = (username: string) => `${CAPTCHA_KEY_PREFIX}userid:${username}`;
const userIdToUsernameKey = (userid: number) => `${CAPTCHA_KEY_PREFIX}username:${userid}`;

type CaptchaRepositoryParams = Pick<DIContainerInternal, "valkeyClient">;

export class CaptchaRepository {
	readonly #client: GlideClient;

	constructor({ valkeyClient }: CaptchaRepositoryParams) {
		this.#client = valkeyClient;
	}

	async addUserVerificationCheck(verification: MemberVerification): Promise<void> {
		const transaction = new Batch(true);
		const expiry = {
			type: TimeUnit.Milliseconds,
			count: VALUES_EXPIRATION,
		};
		transaction.set(userAskedQuestionKey(verification.userId), verification.question, { expiry });
		transaction.set(userExpectedAnswerKey(verification.userId), verification.answer, { expiry });
		transaction.set(questionFirstAskedAtKey(verification.userId), Date.now().toString(), { expiry });
		transaction.sadd(userMsgIdsKey(verification.userId), [verification.msgId.toString()]);
		transaction.pexpire(userMsgIdsKey(verification.userId), VALUES_EXPIRATION);
		if (verification.userName) {
			transaction.set(usernameToUserIdKey(verification.userName), verification.userId.toString(), { expiry });
			transaction.set(userIdToUsernameKey(verification.userId), verification.userName);
		}
		await this.#client.exec(transaction, true);
	}

	async addUserVerificationMsg(userId: number, msgId: number): Promise<void> {
		const key = userMsgIdsKey(userId);
		await this.#client.sadd(key, [msgId.toString()]);
		await this.#client.pexpire(key, VALUES_EXPIRATION, { expireOption: ExpireOptions.HasNoExpiry });
	}

	async incrAttemptsMade(userId: number): Promise<number> {
		const key = userAttemptsMadeKey(userId);
		const attemptsMade = await this.#client.incr(key);
		await this.#client.pexpire(key, VALUES_EXPIRATION, { expireOption: ExpireOptions.HasNoExpiry });
		return attemptsMade;
	}

	async getVerificationQuestion(userId: number): Promise<string | undefined> {
		const answer = await this.#client.get(userAskedQuestionKey(userId));
		return answer?.toString();
	}

	async getExpectedAnswer(userId: number): Promise<string | undefined> {
		const answer = await this.#client.get(userExpectedAnswerKey(userId));
		return answer?.toString();
	}

	async removeUserVerificationCheck(userIdOrUsername: number | string): Promise<void> {
		const user = await this.#searchMember(userIdOrUsername);
		if (!user) {
			return;
		}
		const keysToDelete = [
			userAskedQuestionKey(user.id),
			userExpectedAnswerKey(user.id),
			questionFirstAskedAtKey(user.id),
			userAttemptsMadeKey(user.id),
			userIdToUsernameKey(user.id),
			userMsgIdsKey(user.id),
		];
		if (user.name) {
			keysToDelete.push(usernameToUserIdKey(user.name));
		}

		await this.#client.del(keysToDelete);
	}

	async getUserIdsForVerificationsOlderThan(timestampMs: number): Promise<number[]> {
		const result = await this.#client.invokeScript(CaptchaRepository.getUserIdsForVerificationsOlderThanScript, {
			args: [QUESTION_FIRST_ASKED_AT_PREFIX, timestampMs.toString()],
		});
		return Array.isArray(result) ? result.map((id) => Number(id)) : [];
	}

	async getVerificationMsgIds(userIdOrUsername: number | string): Promise<number[]> {
		const member = await this.#searchMember(userIdOrUsername);
		if (!member) {
			return [];
		}
		const msgIdsStr = await this.#client.smembers(userMsgIdsKey(member.id));
		return Array.from(msgIdsStr, toNumber).filter((v) => v != null);
	}

	async clearAllVerifications(): Promise<void> {
		let cursor: GlideString = "0";
		do {
			const [newCursor, keys] = await this.#client.scan(cursor, {
				match: CAPTCHA_KEY_PREFIX + "*",
			});
			cursor = newCursor;
			if (keys.length) {
				await this.#client.del(keys);
			}
		} while (cursor !== "0");
	}

	async #searchMember(
		userIdOrUsername: number | string,
	): Promise<{ id: number; name: string | undefined } | undefined> {
		if (typeof userIdOrUsername === "number") {
			const userId = userIdOrUsername;
			const username = await this.#client.get(userIdToUsernameKey(userId));
			return { id: userId, name: username?.toString() };
		} else {
			const username = userIdOrUsername;
			const userId = toNumber(await this.#client.get(usernameToUserIdKey(username)));
			if (userId == null) return undefined;
			return { id: userId, name: username };
		}
	}

	private static readonly getUserIdsForVerificationsOlderThanScript = new Script(d`
		local basePattern = ARGV[1]
		local timestampMs = tonumber(ARGV[2])
		local userIds = {}
		local count = 0
		local maxCount = 100

		local scanPattern = basePattern .. "*"
		local extractPattern = basePattern .. "(%d+)"

		local cursor = "0"
		repeat
			local result = redis.call("SCAN", cursor, "MATCH", scanPattern, "COUNT", 100)
			cursor = result[1]
			local keys = result[2]
			
			for i = 1, #keys do
				if count >= maxCount then
					break
				end
				
				local timestampStr = redis.call("GET", keys[i])
				if timestampStr then
					local timestamp = tonumber(timestampStr)
					if timestamp and timestamp < timestampMs then
						local userId = string.match(keys[i], extractPattern)
						if userId then
							table.insert(userIds, tonumber(userId))
							count = count + 1
						end
					end
				end
			end
		until cursor == "0" or count >= maxCount
		
		return userIds`);
}
