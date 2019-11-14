#!/usr/bin/env node
require("dotenv").config();
const bot = require("./components/bot");
const TOKEN = bot.token;

const express = require("express");

const lngchk = require("./components/language-checker");
const av = require("./components/admin-validator");
const helpers = require("./components/helper-commands");
const UserViolationTracker = require("./components/user-violation-tracker");
const retranslate = require("./components/retranslate");

// =============================================================================

const url = process.env.URL;
const ip = process.env.IP || "0.0.0.0";
const port = process.env.PORT || 8085;

if (!url) {
  console.error("Please supply both URL via environment variables!");
  process.exit(1);
}

const app = express();
app.use(express.json());

// =============================================================================

bot.onText(/\/rules/, helpers.rules);
bot.onText(/\/help/, helpers.help);
bot.onText(/^\/cooldown$/, lngchk.cooldownInfo.bind(lngchk));
bot.onText(/^\/today$/, lngchk.today.bind(lngchk));

bot.onText(/^\/autolangday$/, av.adminOnly(lngchk.autolangday.bind(lngchk)));
bot.onText(/^\/forcelang +([a-zA-Z]*)$/, av.adminOnly(lngchk.forcelang.bind(lngchk)));
bot.onText(/^\/set_cooldown(?: (\d+))?$/, av.adminOnly(lngchk.setCooldown.bind(lngchk)));
bot.onText(/^\/flush$/, av.adminOnly(av.refreshAdmins.bind(av)));
bot.onText(/^\/info$/, av.adminOnly(helpers.info));
bot.onText(/^\/version$/, av.adminOnly(helpers.version));
bot.onText(/^\/mute$/, av.adminOnly(lngchk.toggleMuteCapacity.bind(lngchk)));
bot.onText(/\/pardon$/, av.adminOnly(UserViolationTracker.flush));
bot.onText(/^\/mute_expiration(?: +(\d+))?$/, av.adminOnly(UserViolationTracker.muteExpiration));
bot.onText(/^\/mute_duration(?: +(\d+))?$/, av.adminOnly(UserViolationTracker.muteDuration));
bot.onText(/^\/mute_warnings(?: +(\d+))?$/, av.adminOnly(UserViolationTracker.muteWarnings));
bot.onText(/^\/mute_score$/, av.adminOnly(UserViolationTracker.muteScore));
bot.onText(/^\/threshold(?: +([0-9.]+))?$/, av.adminOnly(lngchk.threshold.bind(lngchk)));
bot.onText(/^\/rt /, av.adminOnly(retranslate));

bot.on("text", (msg) => {
  lngchk.check(msg);
});

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
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
