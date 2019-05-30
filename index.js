require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const messages = require("./messages");
const models = require('./models');
const LanguageChecker = require("./components/language-checker");
const AdminValidator = require("./components/admin-validator");

const TOKEN = process.env.TELEGRAM_TOKEN;
const url = process.env.URL;
const ip = process.env.IP || '0.0.0.0';
const port = process.env.PORT || 8085;

if (!TOKEN || !url) {
  console.error("Please supply both TELEGRAM_TOKEN & URL via environment variables!");
  process.exit(1);
}

// No need to pass any parameters as we will handle the updates with Express
const bot = new TelegramBot(TOKEN);

const lngchk = new LanguageChecker(bot);
const av = new AdminValidator(bot);

const app = express();
app.use(express.json());

bot.onText(/\/rules/, (msg) => {
  bot.sendMessage(msg.chat.id, messages.rules);
});

bot.onText(/\/cid/, av.isAdmin((msg) => {
  bot.sendMessage(msg.chat.id, `CID: ${msg.chat.id}`);
}));

/* TODO
bot.onText(/\/me/, (msg) => {
  bot.sendMessage(msg.chat.id, "ME");
});
bot.onText(/\/list/, (msg, match) => {
  const resp = match[1];
  bot.sendMessage(msg.chat.id, "LIST: " + resp);
});
bot.onText(/\/info (.+)/, (msg, match) => {
  const userName = match[1];
  bot.sendMessage(msg.chat.id, "INFO: " + userName);
});
*/
// CID: -1001418511481
bot.onText(/^\/autolangday$/, av.isAdmin(lngchk.autolangday.bind(lngchk)));
bot.onText(/^\/forcelang +([a-zA-Z]*)$/, av.isAdmin(lngchk.forcelang.bind(lngchk)));
bot.onText(/^\/cooldown$/, lngchk.cooldownInfo.bind(lngchk));
bot.onText(/^\/set_cooldown(?: (\d+))?$/, av.isAdmin(lngchk.setCooldown.bind(lngchk)));
bot.onText(/^\/today$/, lngchk.today.bind(lngchk));

bot.on('text', (msg) => {
  lngchk.check(msg);
});

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// =============================================================================
models.sequelize.sync().then(()=>{
  app.listen(port, ip, function() {
    console.log(`Http server is listening on ${ip}:${port}`);
    console.log(`Setting webhook on ${url}/bot${TOKEN}`);
    bot.setWebHook(`${url}/bot${TOKEN}`).then((d)=> {
      console.log("Webhook is set", d);
    });
  });

}).catch(err=>{
  console.log("Connection to db failed: ", err);
  process.exit(1);
});
