/** biome-ignore-all lint/style/noNonNullAssertion: used on env supplied in tests configuration */
/** biome-ignore-all lint/suspicious/noExplicitAny: used in mocks  */
import { before, beforeEach, describe, it, mock } from "node:test";
import type { BotContext } from "../src/BotContext.ts";
import { Time } from "../src/enums/Time.ts";
import { logger } from "../src/logger.ts";
import { cooldownService } from "../src/slices/Cooldown/service.ts";
import { checkMessageLanguage, getWarningMessage } from "../src/slices/checkMessageLanguage.ts";
import { langDayService } from "../src/slices/LangDay/service.ts";

const reply = mock.fn();

const RU_TEXT = "что-то на русском тут написано";
const EN_TEXT = "something in english here";

function makeMockDateDay(dayOfWeek: number = 1): Date {
	if (![0, 1, 2, 3, 4, 5, 6].includes(dayOfWeek)) {
		throw new TypeError("day of week must be an int between 0..=6");
	}
	return new Date(`2025-09-0${dayOfWeek}T11:01:58.135Z`);
}

function mockDay(dayOfWeek: number): Disposable {
	const prevValue = Date.now();
	const mockDate = makeMockDateDay(dayOfWeek);
	mock.timers.setTime(mockDate.getTime()); // Tuesday, aka English day
	return {
		[Symbol.dispose]() {
			mock.timers.setTime(prevValue);
		},
	};
}

describe("checkMessageLanguage", () => {
	before(() => {
		mock.timers.enable({
			apis: ["Date"],
			now: makeMockDateDay(), // Monday, aka Russian day
		});
	});

	beforeEach(() => {
		reply.mock.resetCalls();
		cooldownService.reset();
	});

	it("issues a warning on a language mismatch", async (t) => {
		await checkMessageLanguage(makeMockContext(RU_TEXT));
		t.assert.equal(reply.mock.callCount(), 0, "reply isn't called on correct language");

		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 1);
		t.assert.equal(reply.mock.calls[0]?.arguments[0], getWarningMessage("ru"));
	});

	it("day of week determines the correct language", async (t) => {
		using _ = mockDay(2);
		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 0, "reply isn't called on correct language");

		await checkMessageLanguage(makeMockContext(RU_TEXT));
		t.assert.equal(reply.mock.callCount(), 1);
		t.assert.equal(reply.mock.calls[0]?.arguments[0], getWarningMessage("en"));
	});

	it("doesn't react on messages from other chats besides the configured one", async (t) => {
		await checkMessageLanguage(makeMockContext(EN_TEXT, { chatId: 0xdeadbeef }));
		t.assert.equal(reply.mock.callCount(), 0, "wrong chat -- no reaction");

		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 1, "correct chat -- warning issued");
	});

	it("doesn't issue repeated messages, while cooldown is active", async (t) => {
		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 1, "first warning is issued");
		mock.timers.tick(5 * Time.Seconds);

		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 1, "No new warnings, as we're cooling down");

		mock.timers.tick(cooldownService.getCooldownValue());
		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 2, "After the cooldown we can issue warnings again");
	});

	it("messages written in roughly the same amount of both languages don't have a warning", async (t) => {
		await checkMessageLanguage(makeMockContext([EN_TEXT + RU_TEXT].join(" ")));
		t.assert.equal(reply.mock.callCount(), 0, "no warning for bilingual messages");

		await checkMessageLanguage(makeMockContext([EN_TEXT, EN_TEXT, RU_TEXT].join(" ")));
		t.assert.equal(reply.mock.callCount(), 1, "More english than russian -- issuing a warning");
	});

	it("respects forced language", async (t) => {
		langDayService.setForcedLanguage("en");
		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 0, "No warning as the language is forced");

		langDayService.setForcedLanguage(undefined);
		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 1, "Forced language removed -- a warning");
	});

	it("respects disabled lang day checks", async (t) => {
		langDayService.setLangDayDisabled(true);
		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 0, "No warning as the lang checks are disabled");

		langDayService.setLangDayDisabled(false);
		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 1, "Lang checks enabled again -- a warning");
	});

	it("doesn't issue a warning on short texts", async (t) => {
		await checkMessageLanguage(makeMockContext("Hello!"));
		t.assert.equal(reply.mock.callCount(), 0, "No warning on short english text");

		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 1, "A warning on longer english text");
	});

	it("doesn't check old messages", async (t) => {
		await checkMessageLanguage(makeMockContext(EN_TEXT, { date: new Date("2020-01-02").getTime() }));
		t.assert.equal(reply.mock.callCount(), 0, "No warning for old messages");
		await checkMessageLanguage(makeMockContext(EN_TEXT));
		t.assert.equal(reply.mock.callCount(), 1, "A warning for a fresh one");
	});
});

interface MakeMockContextOpts {
	chatId?: number;
	date?: number;
}

// Mock context, only the bare minimum of fields is provided here
function makeMockContext(
	text: string,
	{ chatId = +process.env.CHAT_ID!, date = Date.now() }: MakeMockContextOpts = {},
): BotContext {
	return {
		logger,
		reply: reply as any,
		targetChatId: +process.env.CHAT_ID!,
		message: {
			date,
			text,
			chat: {
				id: chatId,
			},
			from: {
				username: "testUser",
			},
		},
	} as BotContext;
}
