import { describe, it } from "node:test";
import { isMarkdownString, md, rawMd } from "../md.ts";

describe("md", () => {
	it("escapes markdown string sequence, so it's valid TG markdown", (t) => {
		t.assert.equal(md`Hi!`, "Hi\\!");
	});

	it("escapes passed params as well", (t) => {
		t.assert.equal(md`Hi, ${"john.doe"}!`, "Hi, john\\.doe\\!");
	});

	it("handles single string input", (t) => {
		t.assert.equal(md("Hello! World."), "Hello\\! World\\.");
	});

	it("escapes special markdown characters in template literals", (t) => {
		t.assert.equal(md`[link](url)`, "\\[link\\]\\(url\\)");
		t.assert.equal(md`# Header`, "\\# Header");
		t.assert.equal(md`> Quote`, "\\> Quote");
		t.assert.equal(md`- List item`, "\\- List item");
		t.assert.equal(md`= Equal sign`, "\\= Equal sign");
		t.assert.equal(md`{code}`, "\\{code\\}");
		t.assert.equal(md`Back\\slash`, "Back\\\\slash");
	});

	it("preserves formatting characters like * _ ~ |", (t) => {
		t.assert.equal(md`*bold* _italic_ ~strike~ |spoiler|`, "*bold* _italic_ ~strike~ |spoiler|");
	});

	it("removes formatting characters from passed values", (t) => {
		const val = "*bold* _italic_ ~strike~ |spoiler|";
		t.assert.equal(md`${val}`, "\\*bold\\* \\_italic\\_ \\~strike\\~ \\|spoiler\\|");
	});

	it("removes formatting characters from passed values", (t) => {
		const val = "*bold* _italic_ ~strike~ |spoiler|";
		t.assert.equal(md`${val}`, "\\*bold\\* \\_italic\\_ \\~strike\\~ \\|spoiler\\|");
	});

	it("does not escape rawMd values", (t) => {
		const raw = rawMd`[link](url) *bold* _italic_ ~strike~ |spoiler|`;
		t.assert.equal(md`Click ${raw} here`, "Click [link](url) *bold* _italic_ ~strike~ |spoiler| here");
	});

	it("handles numbers in values", (t) => {
		t.assert.equal(md`Count: ${42}`, "Count: 42");
		t.assert.equal(md`Price: $${3.14}`, "Price: $3\\.14");
	});

	it("handles multiple values", (t) => {
		const name = "world";
		t.assert.equal(md`Hello ${name}! You have ${5} messages.`, "Hello world\\! You have 5 messages\\.");
	});

	it("handles empty template strings", (t) => {
		t.assert.equal(md``, "");
		t.assert.equal(md(""), "");
	});

	it("applies dedent to remove common indentation", (t) => {
		const result = md`
			Line 1
			Line 2
		`;
		t.assert.equal(result, "Line 1\nLine 2");
	});
});

describe("rawMd", () => {
	it("creates raw markdown strings without escaping", (t) => {
		const result = rawMd`[link](url)`;
		t.assert.equal(String(result), "[link](url)");
		t.assert.equal(isMarkdownString(result), true);
	});

	it("handles single string input", (t) => {
		const result = rawMd("*bold* text");
		t.assert.equal(String(result), "*bold* text");
		t.assert.equal(isMarkdownString(result), true);
	});

	it("escapes interpolated values that are not MarkdownStrings", (t) => {
		const result = rawMd`*Bold ${"[text]"}*`;
		t.assert.equal(String(result), "*Bold \\[text\\]*");
	});

	it("preserves interpolated MarkdownStrings without escaping", (t) => {
		const inner = rawMd`[link](url)`;
		const result = rawMd`Click ${inner} here`;
		t.assert.equal(String(result), "Click [link](url) here");
	});

	it("handles numbers in values", (t) => {
		const result = rawMd`Count: ${42}`;
		t.assert.equal(String(result), "Count: 42");
	});

	it("creates proper MarkdownString type", (t) => {
		const result = rawMd`test`;
		t.assert.equal(isMarkdownString(result), true);
		t.assert.equal(typeof result, "object");
	});

	it("handles empty strings", (t) => {
		const result1 = rawMd``;
		const result2 = rawMd("");
		t.assert.equal(String(result1), "");
		t.assert.equal(String(result2), "");
		t.assert.equal(isMarkdownString(result1), true);
		t.assert.equal(isMarkdownString(result2), true);
	});
});

describe("isMarkdownString", () => {
	it("returns true for MarkdownString objects", (t) => {
		const md1 = md`test`;
		const raw1 = rawMd`test`;
		t.assert.equal(isMarkdownString(md1), true);
		t.assert.equal(isMarkdownString(raw1), true);
	});

	it("returns false for regular strings", (t) => {
		t.assert.equal(isMarkdownString("test"), false);
		t.assert.equal(isMarkdownString(""), false);
	});

	it("returns false for non-string values", (t) => {
		t.assert.equal(isMarkdownString(null), false);
		t.assert.equal(isMarkdownString(undefined), false);
		t.assert.equal(isMarkdownString(42), false);
		t.assert.equal(isMarkdownString({}), false);
		t.assert.equal(isMarkdownString([]), false);
	});
});
