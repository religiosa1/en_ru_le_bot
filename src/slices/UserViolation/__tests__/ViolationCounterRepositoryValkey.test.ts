import { after, before, beforeEach, describe, it } from "node:test";
import { type StartedValkeyContainer, ValkeyContainer } from "@testcontainers/valkey";
import { GlideClient } from "@valkey/valkey-glide";
import { Time } from "../../../enums/Time.ts";
import { ViolationCounterRepositoryValkey } from "../ViolationCounterRepositoryValkey.ts";

describe("ViolationSettingsRepositoryValkey", () => {
	let container: StartedValkeyContainer;
	let client: GlideClient;

	before(async () => {
		container = await new ValkeyContainer("valkey/valkey:8.0").start();
		client = await GlideClient.createClient({
			addresses: [{ host: container.getHost(), port: container.getPort() }],
		});
	});

	after(async () => {
		client.close();
		await container.stop({ timeout: 5000 });
	});

	beforeEach(async () => {
		await client.flushall();
	});

	describe("register and get", () => {
		it("allows to register a violation for user", async (t) => {
			const repo = new ViolationCounterRepositoryValkey({ valkeyClient: client });

			let counter = await repo.registerViolation(123, "john", 5 * Time.Minutes);
			t.assert.equal(counter, 1, "initial count is 1");
			counter = await repo.registerViolation(123, "john", 5 * Time.Minutes);
			t.assert.equal(counter, 2, "repeated counter is 2");
		});

		it("allows to retrieve the amount of violations", async (t) => {
			const repo = new ViolationCounterRepositoryValkey({ valkeyClient: client });

			await repo.registerViolation(123, "john", 5 * Time.Minutes);

			const searchById = await repo.getViolationCount(123);
			t.assert.equal(searchById, 1, "by id");
			const searchByUserName = await repo.getViolationCount("john");
			t.assert.equal(searchByUserName, 1, "by username");
		});

		it("returns undefined on search for non-existing users", async (t) => {
			const repo = new ViolationCounterRepositoryValkey({ valkeyClient: client });

			const searchById = await repo.getViolationCount(123);
			t.assert.equal(searchById, undefined, "by id");
			const searchByUserName = await repo.getViolationCount("john");
			t.assert.equal(searchByUserName, undefined, "by username");
		});
	});

	describe("pardon a user", () => {
		it("allows to pardon a user by userId", async (t) => {
			const repo = new ViolationCounterRepositoryValkey({ valkeyClient: client });

			await repo.registerViolation(123, "john", 5 * Time.Minutes);
			t.assert.equal(await repo.getViolationCount(123), 1, "before");
			await repo.removeViolation(123);
			t.assert.equal(await repo.getViolationCount(123), undefined, "after");
		});

		it("allows to pardon a user by username", async (t) => {
			const repo = new ViolationCounterRepositoryValkey({ valkeyClient: client });

			await repo.registerViolation(123, "john", 5 * Time.Minutes);
			t.assert.equal(await repo.getViolationCount(123), 1, "before");
			await repo.removeViolation("john");
			t.assert.equal(await repo.getViolationCount(123), undefined, "after");
		});

		it("does nothing on pardoning a non-existing entry", async () => {
			const repo = new ViolationCounterRepositoryValkey({ valkeyClient: client });

			await repo.removeViolation("john");
		});
	});

	describe("pardon everyone", () => {
		it("allows to pardon all users", async (t) => {
			const repo = new ViolationCounterRepositoryValkey({ valkeyClient: client });

			await repo.registerViolation(123, "john", 5 * Time.Minutes);
			await repo.registerViolation(321, "doe", 5 * Time.Minutes);

			const removedIds = await repo.removeAllViolations();
			t.assert.deepEqual(removedIds.toSorted(), [123, 321]);
			t.assert.equal(await repo.getViolationCount(123), undefined, "after");
			t.assert.equal(await repo.getViolationCount(321), undefined, "after");
		});

		it("does nothing if there's no violations", async (t) => {
			const repo = new ViolationCounterRepositoryValkey({ valkeyClient: client });
			const got = await repo.removeAllViolations();
			t.assert.deepEqual(got, []);
		});
	});
});
