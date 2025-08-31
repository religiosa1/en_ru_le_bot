export interface ViolationStats {
	value: number;
	maxViolations: number;
}

export interface ViolationCounterRepository {
	/**
	 * As telegram doesn't allow to get all usernames from a chat to a bot, but we have a username in a message,
	 * we're registering them together during a violation, so we can later search with this registered username
	 * in pardon command. Some users don't have usernames -- worse for them.
	 */
	registerViolation(userId: number, username: string | undefined, ttlMs: number): Promise<number>;
	/**
	 * Remove violation for a user.
	 * @param userIdOrHandle either a number userid, or username (as in mention, but without the leading @);
	 */
	removeViolation(userIdOrHandle: string | number): Promise<boolean>;
	removeAllViolations(): Promise<number>;
}

export interface ViolationSettingsRepository {
	getMuteEnabled(): Promise<boolean>;
	setMuteEnabled(val: boolean): Promise<void>;

	getMaxViolationNumber(): Promise<number>;
	setMaxViolationNumber(val: number): Promise<void>;

	getMuteDuration(): Promise<number>;
	setMuteDuration(val: number): Promise<void>;

	getWarningsExpiry(): Promise<number>;
	setWarningsExpiry(val: number): Promise<void>;
}
