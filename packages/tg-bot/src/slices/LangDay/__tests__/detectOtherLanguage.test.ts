import { describe, it } from "node:test";
import { detectOtherLanguage } from "../detectOtherLanguage.ts";

describe("detectOtherLanguage", () => {
	it("returns false for texts in Russian", (t) => {
		const text = "кажется, наш Боб-зе-бот стал самым активным участником этой группы 😄😄😄";
		t.assert.equal(detectOtherLanguage(text), false);
	});

	it("returns false for texts in English", (t) => {
		const text = "I personally wouldn’t bother unless eon gets himself a ban hammer.";
		t.assert.equal(detectOtherLanguage(text), false);
	});

	it("returns false for fancy texts with diaeresis in English", (t) => {
		const text = "naïve or coöperate";
		t.assert.equal(detectOtherLanguage(text), false);
	});

	it("returns false for text in mixed Russian/English", (t) => {
		const text = `Hi guys, I hope I can learn English and Russian.

    Привет, ребята! Надеюсь, я смогу выучить английский и русский.`;

		t.assert.equal(detectOtherLanguage(text), false);
	});

	it("returns true for east-asian languages", (t) => {
		const text = "你们不能对 Eon 实施制裁！ 西方需要停止殖民";
		t.assert.equal(detectOtherLanguage(text), true);
	});

	it("returns true for arabic languages", (t) => {
		const text = "لوحة المفاتيح العربية";
		t.assert.equal(detectOtherLanguage(text), true);
	});

	it("returns true French", (t) => {
		const text = "Ça les fait travailler vite. ";
		t.assert.equal(detectOtherLanguage(text), true);
	});

	it("returns false for some kaomojis", (t) => {
		const text = "(╯°□°）╯︵ ┻━┻  ¯\\_(ツ)_/¯";
		t.assert.equal(detectOtherLanguage(text), false);
	});
});
