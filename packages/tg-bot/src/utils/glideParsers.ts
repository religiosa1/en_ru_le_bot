export function toNumber(val: string | null | undefined | Uint8Array): number | undefined {
	if (!val) return undefined;
	const num = +val;
	if (Number.isNaN(num)) return undefined;
	return num;
}

export function toBool(value: string | Uint8Array | null | undefined): boolean | undefined {
	if (value == null) {
		return undefined;
	}
	if (typeof value !== "string") {
		return false;
	}
	return value === "true";
}
