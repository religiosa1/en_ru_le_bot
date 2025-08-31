export function toNumber(
	val: string | null | undefined | Uint8Array,
): number | undefined {
	if (!val) return undefined;
	const num = +val;
	if (Number.isNaN(num)) return undefined;
	return num;
}
