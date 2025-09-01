/** biome-ignore-all lint/style/noNonNullAssertion: used on env supplied in tests configuration */
/** biome-ignore-all lint/suspicious/noExplicitAny: used in mocks  */
import { before, beforeEach, describe, it, mock } from "node:test";
import type { BotContext } from "../../../BotContext.ts";
import { LanguageEnum } from "../../../enums/Language.ts";
import { logger } from "../../../logger.ts";
import type { BotContextWithMsgLanguage } from "../../../models/BotContextWithMsgLanguage.ts";
import type { ChatAdminRepo } from "../../ChatAdmins/service.ts";
import { checkMessageLanguage } from "../middleware.ts";
import { LangDayService } from "../service.ts";

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
	const nextFn = mock.fn(() => Promise.resolve());
	before(() => {
		mock.timers.enable({
			apis: ["Date"],
			now: makeMockDateDay(), // Monday, aka Russian day
		});
	});

	beforeEach(() => {
		nextFn.mock.resetCalls();
	});

	it("passes call to next middleware on lang mismatch", async (t) => {
		await checkMessageLanguage(makeMockContext(RU_TEXT), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 0, "nextFn isn't called on correct language");

		const ctx = makeMockContext(EN_TEXT);
		await checkMessageLanguage(ctx, nextFn);
		t.assert.equal(nextFn.mock.callCount(), 1);
		t.assert.equal(ctx.msgLanguage, LanguageEnum.English);
	});

	it("day of week determines the correct language", async (t) => {
		using _ = mockDay(2);
		await checkMessageLanguage(makeMockContext(EN_TEXT), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 0, "reply isn't called on correct language");

		const ctx = makeMockContext(RU_TEXT);
		await checkMessageLanguage(ctx, nextFn);
		t.assert.equal(nextFn.mock.callCount(), 1);
		t.assert.equal(ctx.msgLanguage, LanguageEnum.Russian);
	});

	it("doesn't react on messages from other chats besides the configured one", async (t) => {
		await checkMessageLanguage(makeMockContext(EN_TEXT, { chatId: 0xdeadbeef }), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 0, "wrong chat -- no reaction");

		await checkMessageLanguage(makeMockContext(EN_TEXT), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 1, "correct chat -- next called");
	});

	it("doesn't react on messages from chat admins", async (t) => {
		await checkMessageLanguage(makeMockContext(EN_TEXT, { adminsIds: [123] }), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 0, "admin -- no reaction");

		await checkMessageLanguage(makeMockContext(EN_TEXT), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 1, "not a admin -- next called");
	});

	it("messages written in roughly the same amount of both languages don't have a warning", async (t) => {
		await checkMessageLanguage(makeMockContext([EN_TEXT + RU_TEXT].join(" ")), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 0, "no next for bilingual messages");

		await checkMessageLanguage(makeMockContext([EN_TEXT, EN_TEXT, RU_TEXT].join(" ")), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 1, "More english than russian -- next called");
	});

	it("respects forced language", async (t) => {
		const ctx = makeMockContext(EN_TEXT, { forcedLanguage: "en" });
		await checkMessageLanguage(ctx, nextFn);
		t.assert.equal(nextFn.mock.callCount(), 0, "No next as the language is forced");

		await checkMessageLanguage(makeMockContext(EN_TEXT), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 1, "Forced language removed -- next called");
	});

	it("respects disabled lang day checks", async (t) => {
		const ctx = makeMockContext(EN_TEXT, { langDayDisabled: true });
		await checkMessageLanguage(ctx, nextFn);
		t.assert.equal(nextFn.mock.callCount(), 0, "No next as the lang checks are disabled");

		await checkMessageLanguage(makeMockContext(EN_TEXT), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 1, "Lang checks enabled again -- next called");
	});

	it("doesn't issue a warning on short texts", async (t) => {
		await checkMessageLanguage(makeMockContext("Hello!"), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 0, "No next on short english text");

		await checkMessageLanguage(makeMockContext(EN_TEXT), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 1, "next called on longer english text");
	});

	it("doesn't check old messages", async (t) => {
		await checkMessageLanguage(makeMockContext(EN_TEXT, { date: new Date("2020-01-02").getTime() }), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 0, "No next for old messages");
		await checkMessageLanguage(makeMockContext(EN_TEXT), nextFn);
		t.assert.equal(nextFn.mock.callCount(), 1, "next called for a fresh one");
	});
});

interface MakeMockContextOpts {
	chatId?: number;
	date?: number;
	adminsIds?: number[];
	forcedLanguage?: LanguageEnum;
	langDayDisabled?: boolean;
}

// Mock context, only the bare minimum of fields is provided here
function makeMockContext(
	text: string,
	{
		chatId = +process.env.CHAT_ID!,
		date = Date.now(),
		adminsIds = [],
		forcedLanguage,
		langDayDisabled,
	}: MakeMockContextOpts = {},
): BotContext & Partial<BotContextWithMsgLanguage> {
	const mockAdminRepo = {
		getAdminsIds: () => adminsIds,
	} as unknown as ChatAdminRepo;
	const langDayService = new LangDayService();
	if (langDayDisabled) langDayService.setLangDayDisabled(true);
	if (forcedLanguage) langDayService.setForcedLanguage(forcedLanguage);
	return {
		logger,
		container: {
			chatAdminRepo: mockAdminRepo,
			langDayService,
		},
		message: {
			date,
			text,
			chat: {
				id: chatId,
			},
			from: {
				id: 123,
				username: "testUser",
			},
		},
	} as BotContext;
}
