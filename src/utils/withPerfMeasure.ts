/** Wrapping a function in performance.now() calls, to figure out how long did it take to execute. */
export async function withPerfMeasure(fn: () => unknown): Promise<number> {
	const startTs = performance.now();
	await fn();
	return performance.now() - startTs;
}
