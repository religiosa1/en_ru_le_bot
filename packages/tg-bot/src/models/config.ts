import { raise } from "../utils/raise.ts";

interface IConfig {
	token: string;
	chatId: number;
	admins: string[];
}

let config: IConfig | undefined;
export function getConfig(): IConfig {
	config ??= parseConfigFromEnv();
	return config;
}

function parseConfigFromEnv(env = process.env): IConfig {
	const token =
		env.TOKEN ||
		raise("Bot token is required to be passed through ENV variables");
	const chatId = parseInt(env.CHAT_ID || "", 10);
	const admins = parseAdmins(env.ADMINS);

	return {
		token,
		chatId,
		admins,
	};
}

function parseAdmins(adminEnv: string | undefined): string[] {
	if (!adminEnv) return [];
	return adminEnv.split(",").map((i) => i.trim());
}
