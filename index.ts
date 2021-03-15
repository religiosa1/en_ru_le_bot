#!/usr/bin/env ts-node

import * as dotenv from "dotenv";
dotenv.config();

import bot from "./src/bot";
const TOKEN = bot.token;

import polka from "polka";
import type { Message } from "node-telegram-bot-api";

// FIXME
import send from "@polka/send";
import { json } from "body-parser";

import * as lngchk from "./src/interfaces/language-checker";
import * as helpers from  "./src/interfaces/helper-commands";
import * as userViolation from "./src/interfaces/user-violation-interface";
import { retranslate } from "./src/interfaces/retranslate";
import { refreshAdmins } from "./src/interfaces/admin-validator";

// =============================================================================

const url = process.env.URL;
const ip = process.env.IP || "0.0.0.0";
const port = process.env.PORT || 8085;

if (!url) {
  console.error("Please supply both URL via environment variables!");
  process.exit(1);
}

const app = polka();
app.use(json());

// =============================================================================

bot.onText(/^\/rules/, helpers.rules);
bot.onText(/^\/help/, helpers.help);
bot.onText(/^\/cooldown/, lngchk.cooldownInfo);
bot.onText(/^\/today/, lngchk.today);

bot.onText(/^\/autolangday$/, lngchk.autolangday);
bot.onText(/^\/forcelang( +[a-zA-Z]+)?$/, lngchk.forcelang);
bot.onText(/^\/set_cooldown(?: +(\d+))?$/, lngchk.setCooldown);
bot.onText(/^\/flush$/, refreshAdmins);
bot.onText(/^\/info$/, helpers.info);
bot.onText(/^\/version$/, helpers.version);
bot.onText(/^\/mute$/, lngchk.toggleMuteCapacity);
bot.onText(/\/pardon( +@.+)?$/, userViolation.pardon);
bot.onText(/^\/mute_expiration(?: +(\d+))?$/, userViolation.muteExpiration);
bot.onText(/^\/mute_duration(?: +(\d+))?$/, userViolation.muteDuration);
bot.onText(/^\/mute_warnings(?: +(\d+))?$/, userViolation.muteWarnings);
bot.onText(/^\/mute_score$/, userViolation.muteScore);
bot.onText(/^\/threshold(?: +([0-9.]+))?$/, lngchk.threshold);
bot.onText(/^\/badchars(?: +([0-9.]+))?$/, lngchk.badChars);
bot.onText(/^\/rt /, retranslate);
bot.onText(/^\/alarm( +\?)?$/, lngchk.notification);

bot.on("text", (msg: Message) => lngchk.check(msg));

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  send(res, 200);
});

// =============================================================================
app.listen(port, ip, async function() {
  console.log(`Http server is listening on ${ip}:${port}`);
  console.log(`Setting webhook on ${url}/bot${TOKEN}`);
  try {
    const d = await bot.setWebHook(`${url}/bot${TOKEN}`) as string;
    console.log("Webhook is set", d);
  } catch(e) {
    console.error("Failed to set webhooks", e);
    process.exit(1);
  }
});
