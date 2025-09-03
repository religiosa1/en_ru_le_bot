import { describe, it } from "node:test";
import { stripNonLetterOrWhitespaceChars } from "../utils.ts";

describe("stripNonLetterOrWhitespaceChars", () => {
	it("removes punctuation and digits from a message", (t) => {
		t.assert.equal(stripNonLetterOrWhitespaceChars("t😀e!s3t."), "test");
	});

	it("keeps whitespaces in place", (t) => {
		t.assert.equal(stripNonLetterOrWhitespaceChars("test 123 test"), "test  test");
	});

	it("keeps any unicode characters in place", (t) => {
		t.assert.equal(stripNonLetterOrWhitespaceChars("хай 안녕 123"), "хай 안녕 ");
	});
});
