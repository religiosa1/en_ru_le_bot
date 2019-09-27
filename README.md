# English/Russian Language exchange telegram bot.

Simple helper bot for the https://t.me/en_ru_exchange language exchange group.

Its main function is enforcing English/Russian language days in the chat -- days, when corresponding language is preferred. For usage of incorrect language user would receive a warning, or a warning and temporarily mute, depending on the settings (and bot's administrative permissions).

List of all available commands can be found in the index.js file.

Chat administrators can be gathered from environment variables passed to the bot at startup, or gathered via Telegram API from the chat's admins list.

Bot should be deployed on some HTTPS-server, as it works through web-hooks, and Redis installation should be available to it (as it's the place, where per-user warnings are stored).
