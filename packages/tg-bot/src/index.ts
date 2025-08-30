import * as langDetection from "@en-ru-le/language-detection";
import { Bot } from "grammy";
import { logger } from "./logger.ts";
import { getConfig } from "./models/config.ts";
import { cooldownCommands } from "./slices/Cooldown/commands.ts";
import { checkMessageLanguage } from "./slices/checkMessageLanguage.ts";
import { langDayCommands } from "./slices/LangDay/commands.ts";
import { withPerfMeasure } from "./utils/withPerfMeasure.ts";

const config = getConfig();
if (!getConfig().chatId) {
	logger.warn("ChatID isn't set through the ENV, bot language detection isn't possible");
}

const bot = new Bot(config.token);

bot.on("msg:text", checkMessageLanguage);

// Commands to check or force specific day, or to disable language checks completely.
bot.use(langDayCommands);
langDayCommands.setCommands(bot);

// Managing cooldown for language warnings.
bot.use(cooldownCommands);
cooldownCommands.setCommands(bot);

bot.catch((err) => {
	logger.error({ err }, `"An error has occurred: ${err}`);
});

logger.info("Preloading language models...");
const duration = await withPerfMeasure(() => langDetection.loadLanguageModels());
logger.info({ duration }, `Models loaded in ${duration}ms. Starting the bot now`);
bot.start({
	onStart(getMeInfo) {
		logger.info({ info: getMeInfo }, "Bot started");
	},
});
