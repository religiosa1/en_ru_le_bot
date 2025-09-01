import * as langDetection from "@en-ru-le/language-detection";
import { Bot } from "grammy";
import { adminScope } from "./adminScope.ts";
import { BotContext } from "./BotContext.ts";
import { configureDefaultContainer } from "./container.ts";
import { logger } from "./logger.ts";
import { AdminOnlyCommand } from "./models/Command.ts";
import { getConfig } from "./models/config.ts";
import { allCommands } from "./slices/allCommands.ts";
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

logger.info("Initializing DI container and connecting to Valkey");
const container = await configureDefaultContainer();
logger.info("Container initialized");

const bot = new Bot(config.token, {
	ContextConstructor: BotContext,
});
bot.use((ctx, next) => {
	ctx.container = container.cradle;
	return next();
});

for (const command of allCommands) {
	const middleware = command instanceof AdminOnlyCommand ? [adminOnly, command.handler] : [command.handler];
	bot.command(command.command, ...middleware);
}
if (chatId) {
	bot.api.setMyCommands(allCommands.getAllUserCommandGroup().toBotCommands());
	bot.api.setMyCommands(allCommands.getAllAdminCommandGroup().toBotCommands(), { scope: adminScope });
}
bot.on("msg:text", checkMessageLanguage, cooldownMiddleware, userViolationMiddleware);

bot.catch((err) => {
	logger.error({ err }, `"An error has occurred: ${err}`);
});

logger.info("Preloading language models...");
const duration = await withPerfMeasure(() => langDetection.loadLanguageModels());
logger.info({ duration }, `Models loaded in ${duration.toFixed(2)}ms. Starting the bot now`);
bot.start({
	onStart(getMeInfo) {
		logger.info({ info: getMeInfo }, "Bot started");
	},
});
