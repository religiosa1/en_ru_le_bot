export function raise(message?: string, error: ErrorConstructor = Error, opts?: ErrorOptions): never {
	throw new error(message, opts);
}
