export function parseUsername(input: string | RegExpMatchArray | undefined): string | undefined {
	if (input == null) {
		return undefined;
	}
	if (typeof input !== "string") {
		throw new TypeError("Got RegExpMatchArray instead of string");
	}
	input = input.trim();
	if (!input.startsWith("@")) {
		throw new Error("username mention must start from @");
	}
	return input.slice(1);
}
