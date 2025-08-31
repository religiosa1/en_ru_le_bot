declare global {
	namespace NodeJS {
		interface ProcessEnv {
			/** Your usual: production, development, test
			 *
			 * "test" value modifies the behavior of the service for compatibility
			 * with node test runner and should only be used during the test runner
			 * launches.
			 */
			NODE_ENV?: string;

			/** Id of the chat where we're supposed to work. */
			CHAT_ID?: string;

			/** Telegram bot token as supplied by botfather */
			TOKEN?: string;

			/** Valkey host (defaults to localhost)  */
			VALKEY_HOST?: string;
			/** Valkey port (defaults to 6379)  */
			VALKEY_PORT?: string;
		}
	}
}

export {};
