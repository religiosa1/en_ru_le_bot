#!/usr/bin/env node
"use strict";

require("dotenv").config();
const bot = require("./src/bot");
const TOKEN = bot.token;

const polka = require("polka");
const send = require("@polka/send");
const { json } = require("body-parser");

const lngchk = require("./src/interfaces/language-checker");
const helpers = require("./src/interfaces/helper-commands");
const userViolation = require("./src/interfaces/user-violation-interface");
const retranslate = require("./src/interfaces/retranslate");
const adminValidator = require("./src/interfaces/admin-validator");

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
bot.onText(/^\/flush$/, adminValidator.refreshAdmins);
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

bot.on("text", (msg) => {
  lngchk.check(msg);
});

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  send(res, 200);
});

// =============================================================================
app.listen(port, ip, async function() {
  console.log(`Http server is listening on ${ip}:${port}`);
  console.log(`Setting webhook on ${url}/bot${TOKEN}`);
  try {
    let d = await bot.setWebHook(`${url}/bot${TOKEN}`);
    console.log("Webhook is set", d);
  } catch(e) {
    console.error("Failed to set webhooks", e);
    process.exit(1);
  }
});
