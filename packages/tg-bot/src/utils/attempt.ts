type ResultTuple<T> = [data: T, error: undefined] | [data: undefined, error: NonNullable<unknown>];
export function attempt<T>(fn: () => Promise<T>): Promise<ResultTuple<T>>;
export function attempt<T>(fn: () => T): ResultTuple<T>;
export function attempt<T>(fn: () => Promise<T> | T): Promise<ResultTuple<T>> | ResultTuple<T> {
	try {
		const result = fn();
		if (result instanceof Promise) {
			return result.then(
				(d) => [d, undefined] as const,
				(err: unknown) => [undefined, err ?? new Error("nullish error")] as const,
			);
		}
		return [result, undefined];
	} catch (err) {
		return [undefined, err ?? new Error("nullish error")];
	}
}
