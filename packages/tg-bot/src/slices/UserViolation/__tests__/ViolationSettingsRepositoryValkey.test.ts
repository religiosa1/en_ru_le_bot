import { before, beforeEach, describe, it } from "node:test";
import { type StartedValkeyContainer, ValkeyContainer } from "@testcontainers/valkey";
import { GlideClient } from "@valkey/valkey-glide";
import {
	DEFAULT_MAX_VIOLATION,
	DEFAULT_MUTE_DURATION,
	DEFAULT_MUTE_ENABLED,
	DEFAULT_WARNINGS_EXPIRY,
	ViolationSettingsRepositoryValkey,
} from "../ViolationSettingsRepositoryValkey.ts";

describe("ViolationSettingsRepositoryValkey", () => {
	let container: StartedValkeyContainer;
	let client: GlideClient;

	before(async (t) => {
		container = await new ValkeyContainer("valkey/valkey:8.0").start();
		client = await GlideClient.createClient({
			addresses: [{ host: container.getHost(), port: container.getPort() }],
		});
		if ("after" in t) {
			t.after(async () => {
				client.close();
				await container.stop();
			});
		}
	});

	beforeEach(async () => {
		await client.flushall();
	});

	it("returns default values on empty valkey storage", async (t) => {
		const repo = new ViolationSettingsRepositoryValkey(client);

		t.assert.equal(await repo.getMuteEnabled(), DEFAULT_MUTE_ENABLED, "mute enabled");
		t.assert.equal(await repo.getMaxViolationNumber(), DEFAULT_MAX_VIOLATION, "max violation");
		t.assert.equal(await repo.getMuteDuration(), DEFAULT_MUTE_DURATION, "mute duration");
		t.assert.equal(await repo.getWarningsExpiry(), DEFAULT_WARNINGS_EXPIRY, "warning expiry");
	});

	it("sets value and allows to get them in the same session", async (t) => {
		const repo = new ViolationSettingsRepositoryValkey(client);

		await repo.setMuteEnabled(!DEFAULT_MUTE_ENABLED);
		await repo.setMaxViolationNumber(DEFAULT_MAX_VIOLATION * 2);
		await repo.setMuteDuration(DEFAULT_MUTE_DURATION * 2);
		await repo.setWarningsExpiry(DEFAULT_WARNINGS_EXPIRY * 2);

		t.assert.equal(await repo.getMuteEnabled(), !DEFAULT_MUTE_ENABLED, "mute enabled");
		t.assert.equal(await repo.getMaxViolationNumber(), DEFAULT_MAX_VIOLATION * 2, "max violation");
		t.assert.equal(await repo.getMuteDuration(), DEFAULT_MUTE_DURATION * 2, "mute duration");
		t.assert.equal(await repo.getWarningsExpiry(), DEFAULT_WARNINGS_EXPIRY * 2, "warning expiry");
	});

	it("data persists for different clients", async (t) => {
		{
			const repo = new ViolationSettingsRepositoryValkey(client);

			await repo.setMuteEnabled(!DEFAULT_MUTE_ENABLED);
			await repo.setMaxViolationNumber(DEFAULT_MAX_VIOLATION * 2);
			await repo.setMuteDuration(DEFAULT_MUTE_DURATION * 2);
			await repo.setWarningsExpiry(DEFAULT_WARNINGS_EXPIRY * 2);
		}
		{
			const repo = new ViolationSettingsRepositoryValkey(client);

			t.assert.equal(await repo.getMuteEnabled(), !DEFAULT_MUTE_ENABLED, "mute enabled");
			t.assert.equal(await repo.getMaxViolationNumber(), DEFAULT_MAX_VIOLATION * 2, "max violation");
			t.assert.equal(await repo.getMuteDuration(), DEFAULT_MUTE_DURATION * 2, "mute duration");
			t.assert.equal(await repo.getWarningsExpiry(), DEFAULT_WARNINGS_EXPIRY * 2, "warning expiry");
		}
	});
});
