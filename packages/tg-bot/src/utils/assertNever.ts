export function assertNever(value: never, message = `Invariant: unexpected value ${value}`): never {
	throw new Error(message);
}
