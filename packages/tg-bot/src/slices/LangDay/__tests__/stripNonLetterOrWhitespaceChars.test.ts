import { describe, it } from "node:test";
import { stripNonLetterOrWhitespaceChars } from "../utils.ts";

describe("stripNonLetterOrWhitespaceChars", () => {
	it("removes punctuation and digits from a message", (t) => {
		t.assert.equal(stripNonLetterOrWhitespaceChars("t😀e!s3t."), "test");
	});

	it("keeps whitespaces in place", (t) => {
		t.assert.equal(stripNonLetterOrWhitespaceChars("test 123 test"), "test test");
	});

	it("keeps any unicode characters in place", (t) => {
		t.assert.equal(stripNonLetterOrWhitespaceChars("хай 안녕 123"), "хай 안녕");
	});

	it("replaces multiple sequential whitespace chars with a one whitespace and trims output", (t) => {
		t.assert.equal(stripNonLetterOrWhitespaceChars("hi  all"), "hi all");
		t.assert.equal(stripNonLetterOrWhitespaceChars("hi \t\t all"), "hi all");
		t.assert.equal(stripNonLetterOrWhitespaceChars("hi\tall "), "hi all");
		t.assert.equal(stripNonLetterOrWhitespaceChars("\thi all  "), "hi all");
	});

	it("removes urls from the message as well", (t) => {
		const got = stripNonLetterOrWhitespaceChars("hi https://example.com/some?id=123&foo=bar#frag all");
		t.assert.equal(got, "hi all");
	});
});
