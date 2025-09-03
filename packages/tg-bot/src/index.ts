import * as langDetection from "@en-ru-le/language-detection";
import { Bot } from "grammy";
import { BotContext } from "./BotContext.ts";
import { configureDefaultContainer } from "./container.ts";
import { logger } from "./logger.ts";
import { AdminOnlyCommand } from "./models/Command.ts";
import { getConfig } from "./models/config.ts";
import * as scopes from "./scopes.ts";
import { allCommands } from "./slices/allCommands.ts";
// import { captchaMiddleware, onMemberJoinHandler } from "./slices/Captcha/middleware.ts";
import { adminOnly } from "./slices/ChatAdmins/middleware.ts";
import { cooldownMiddleware } from "./slices/Cooldown/middleware.ts";
import { checkMessageLanguage } from "./slices/LangDay/middleware.ts";
import { userViolationMiddleware } from "./slices/UserViolation/middleware.ts";
import { withPerfMeasure } from "./utils/withPerfMeasure.ts";

const config = getConfig();
const chatId = config.chatId;
if (!chatId) {
	logger.warn("ChatID isn't set through the ENV, bot language detection isn't possible");
}

const bot = new Bot(config.token, {
	ContextConstructor: BotContext,
});

logger.info("Initializing DI container and connecting to Valkey");
const container = await configureDefaultContainer(bot.api, chatId);
logger.info("Container initialized");

bot.use((ctx, next) => {
	ctx.container = container.cradle;
	return next();
});

for (const command of allCommands) {
	const middleware = command instanceof AdminOnlyCommand ? [adminOnly, command.handler] : [command.handler];
	bot.command(command.command, ...middleware);
}

if (chatId) {
	bot.api.setMyCommands(allCommands.getMembersCommandGroup().toBotCommands(), { scope: scopes.members });
	bot.api.setMyCommands(allCommands.getAdminsCommandGroup().toBotCommands(), { scope: scopes.admins });
}

// TODO Commented out, until we debug the event update
// bot.on("message:new_chat_members", onMemberJoinHandler);
bot.on("message:new_chat_members", (ctx) => {
	logger.info({ ctx }, "!!!!!!!!!New chat member!!!!!!!!!");
});

// TODO captcha check, once on:new_chat_members is working
bot.on("msg:text", checkMessageLanguage, cooldownMiddleware, userViolationMiddleware);

bot.catch((err) => {
	logger.error({ err }, `"An error has occurred: ${err}`);
});

logger.info("Preloading language models...");
const duration = await withPerfMeasure(() => langDetection.loadLanguageModels());
logger.info({ duration }, `Models loaded in ${duration.toFixed(2)}ms. Starting the bot now`);
bot.start({
	allowed_updates: ["message", "chat_member", "my_chat_member"],
	onStart(getMeInfo) {
		logger.info({ info: getMeInfo }, "Bot started");
	},
});
