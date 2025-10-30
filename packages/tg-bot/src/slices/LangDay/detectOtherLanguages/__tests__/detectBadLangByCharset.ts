import { describe, it } from "node:test";
import { detectBadLangByCharset } from "../detectBadLangByCharset.ts";

describe("detectOtherLanguage", () => {
	it("returns false for texts in Russian", (t) => {
		const text = "кажется, наш Боб-зе-бот стал самым активным участником этой группы 😄😄😄";
		t.assert.equal(detectBadLangByCharset(text), false);
	});

	it("returns false for texts in English", (t) => {
		const text = "I personally wouldn’t bother unless eon gets himself a ban hammer.";
		t.assert.equal(detectBadLangByCharset(text), false);
	});

	it("returns false for fancy texts with diaeresis in English", (t) => {
		const text = "naïve or coöperate";
		t.assert.equal(detectBadLangByCharset(text), false);
	});

	it("returns false if text contains small amount of non-english characters", (t) => {
		const text = "Sorry dear bot, my name is Julioé César I’m from Perú ";
		t.assert.equal(detectBadLangByCharset(text), false);
	});

	it("returns false for text in mixed Russian/English", (t) => {
		const text = `Hi guys, I hope I can learn English and Russian.

    Привет, ребята! Надеюсь, я смогу выучить английский и русский.`;

		t.assert.equal(detectBadLangByCharset(text), false);
	});

	it("returns true for east-asian languages", (t) => {
		const text = "你们不能对 Eon 实施制裁！ 西方需要停止殖民";
		t.assert.equal(detectBadLangByCharset(text), true);
	});

	it("returns true for arabic languages", (t) => {
		const text = "لوحة المفاتيح العربية";
		t.assert.equal(detectBadLangByCharset(text), true);
	});

	// With the current permissive settings this won't work anymore
	// it("returns true French", (t) => {
	// 	const text = "Ça les fait travailler vite. ";
	// 	t.assert.equal(detectBadLangByCharset(text), true);
	// });

	it("returns false for some kaomojis", (t) => {
		const text = "(╯°□°）╯︵ ┻━┻  ¯\\_(ツ)_/¯";
		t.assert.equal(detectBadLangByCharset(text), false);
	});
});
