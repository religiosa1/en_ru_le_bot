import { after, afterEach, before, describe, it, mock } from "node:test";
import { type StartedValkeyContainer, ValkeyContainer } from "@testcontainers/valkey";
import { GlideClient } from "@valkey/valkey-glide";
import { Time } from "../../../enums/Time.ts";
import { CaptchaRepository } from "../CaptchaRepository.ts";
import type { MemberVerification } from "../models.ts";

describe("CaptchaRepository", () => {
	let container: StartedValkeyContainer;
	let valkeyClient: GlideClient;

	before(async () => {
		container = await new ValkeyContainer("valkey/valkey:8.0").start();
		valkeyClient = await GlideClient.createClient({
			addresses: [{ host: container.getHost(), port: container.getPort() }],
		});
	});

	after(async () => {
		valkeyClient.close();
		await container.stop({ timeout: 5000 });
	});

	afterEach(async () => {
		await valkeyClient.flushall();
	});

	const mockVerification: MemberVerification = {
		userId: 123,
		userName: "johnDoe",
		question: "What's the answer to the ultimate question of life, the universe and everything?",
		answer: "42",
		msgId: 32167,
	};

	it("adds verification to valkey", async (t) => {
		const repo = new CaptchaRepository({ valkeyClient });
		await repo.addUserVerificationCheck(mockVerification);

		const question = await repo.getVerificationQuestion(mockVerification.userId);
		t.assert.equal(question, mockVerification.question);

		const answer = await repo.getExpectedAnswer(mockVerification.userId);
		t.assert.equal(answer, mockVerification.answer);

		const msgIds = await repo.getVerificationMsgIds(mockVerification.userId);
		t.assert.deepEqual(msgIds, [mockVerification.msgId]);
	});

	it("adds verification without a username to valkey as well", async (t) => {
		const repo = new CaptchaRepository({ valkeyClient });
		await repo.addUserVerificationCheck({ ...mockVerification, userName: undefined });

		const question = await repo.getVerificationQuestion(mockVerification.userId);
		t.assert.equal(question, mockVerification.question);

		const answer = await repo.getExpectedAnswer(mockVerification.userId);
		t.assert.equal(answer, mockVerification.answer);

		const msgIds = await repo.getVerificationMsgIds(mockVerification.userId);
		t.assert.deepEqual(msgIds, [mockVerification.msgId]);
	});

	it("adds additional messages to the verification", async (t) => {
		const repo = new CaptchaRepository({ valkeyClient });
		await repo.addUserVerificationCheck(mockVerification);

		await repo.addUserVerificationMsg(mockVerification.userId, 123);
		await repo.addUserVerificationMsg(mockVerification.userId, 321);

		const msgIds = await repo.getVerificationMsgIds(mockVerification.userId);
		t.assert.deepEqual(msgIds.toSorted(), [mockVerification.msgId, 123, 321].toSorted());
	});

	it("increments the amount of attempts made", async (t) => {
		const repo = new CaptchaRepository({ valkeyClient });
		await repo.addUserVerificationCheck(mockVerification);

		const res1 = await repo.incrAttemptsMade(mockVerification.userId);
		t.assert.equal(res1, 1);
		const res2 = await repo.incrAttemptsMade(mockVerification.userId);
		t.assert.equal(res2, 2);
	});

	it("removes the verification", async (t) => {
		const repo = new CaptchaRepository({ valkeyClient });
		await repo.addUserVerificationCheck(mockVerification);

		t.assert.deepEqual(await repo.getExpectedAnswer(mockVerification.userId), mockVerification.answer);

		await repo.removeUserVerificationCheck(mockVerification.userId);
		t.assert.equal(await repo.getExpectedAnswer(mockVerification.userId), undefined);
		t.assert.equal(await repo.getVerificationQuestion(mockVerification.userId), undefined);
		t.assert.deepEqual(await repo.getVerificationMsgIds(mockVerification.userId), []);
	});

	it("also removes verification by user name", async (t) => {
		const repo = new CaptchaRepository({ valkeyClient });
		await repo.addUserVerificationCheck(mockVerification);
		t.assert.deepEqual(await repo.getExpectedAnswer(mockVerification.userId), mockVerification.answer);

		await repo.removeUserVerificationCheck(mockVerification.userName ?? "");
		t.assert.equal(await repo.getExpectedAnswer(mockVerification.userId), undefined);
	});

	it("retrieves stale verifications", async (t) => {
		const repo = new CaptchaRepository({ valkeyClient });
		const currentTime = Date.now();
		const oldTime = currentTime - Time.Months;

		mock.timers.enable({
			apis: ["Date"],
			now: oldTime,
		});
		try {
			await repo.addUserVerificationCheck({ ...mockVerification, userId: 1 });
			await repo.addUserVerificationCheck({ ...mockVerification, userId: 2 });
		} finally {
			mock.timers.setTime(currentTime);
			mock.timers.reset();
		}
		// A fresh one, shouldn't be included in the response.
		await repo.addUserVerificationCheck({ ...mockVerification, userId: 3 });

		const staleVerificationUserIds = await repo.getVerificationsOlderThan(Date.now());
		t.assert.deepEqual(staleVerificationUserIds.toSorted(), [1, 2]);
	});
});
