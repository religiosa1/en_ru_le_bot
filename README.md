# EnRuLeBot monorepo

Telegram bot for an en-ru language exchange group chat.

Enforces the usage of one of those two languages on different days of the week.

Consists of two packages:
- [language detection](./packages/language-detection/) ([napi-rs](https://napi.rs/) 
  rust wrapper around [lingua-rs](https://github.com/pemistahl/lingua-rs))
- the actual [telegram bot](./packages/tg-bot/), written in nodejs using
  [grammy](https://grammy.dev/). Requires node v24 or higher, as well as 
  [valkey](https://valkey.io/) instance for storage.

## List of commands available to bot.

Commands are just messages in the chat, starting with a `/` character.
A command must be first part of the message and may be followed by bot user 
handle (e.g. `/help@en_ru_le_bot`) and/or arguments  (e.g. `/help members`).

List of commands is also accessible in the bot menu (by going to direct 
messages with the bot and clicking on "Menu" button). Menu for regular users
displays common commands, while for chat admins it will display admin commands
as well.

All of the commands can be sent in the chat or in DM with the bot (if you don't 
want other users to see them being executed).

The bot logs who executed which command internally, so this information is 
available in the logs.

Some commands expect duration as their argument. Duration can be supplied as an
integer number (e.g. `20`) in this case it will be interpreted in minutes, or 
with a unit suffix. For example:
- `30s` -- 30 seconds 
- `5m30s` -- 5 minutes 30 seconds
- `1h` -- one hour 
- `1.5d` -- 1.5 days (aka 36 hours)

###  Public Commands (Available to all users)

- /today check current day: whether it's English, Russian, or Free
  It accounts for forced days as well.
- /rules display the group's rules
- /help ["members"] display help on bot commands
  For admins it will also display admin-only commands, unless "members" argument
  is supplied.

### Admin-Only Commands
- /settings display current bot settings

- /alarm Toggle notifications about day change on/off

  With alarm on, bot will notify about English/Russian day changes.

- /langchecks Toggle language checks on/off

  If langchecks are disabled, bot won't check message language, or send 
  notifications about day changes. This basically disables the bot, outside of
  settings commands, or displaying rules.

- /forcelang ["en"|"ru"] Force a specific language

  Used to override the standard schedule. Without arguments removes forced 
  language. With an argument, allows to set the forced language, e.g. 
  `/forcelang ru`
- /mute Toggle mutes on language violations on/off

  With mutes off, bot will give warnings to users, but will never restrict their
  permissions (posting messages,photos, etc.) or count the amount of warnings.
- /pardon [@user] - Clears violations counter for a specific user or all users.

  Without arguments removes all counters for all users. Can receive username 
  mention as argument, to clear restrictions for a specific user, e.g. 
  `/pardon @john`.
  
- /mute_duration [duration] - Set or view mute duration
  
  Without arguments displays the current mute duration value -- for how long 
  users' permissions will be restricted so they can't post, after repeated 
  violations. With the argument sets this value.

- /warnings_number [int] - Set or view number of warnings before mute

  The amount of warnings user must receive before his permissions are 
  temporarily restricted. If set to 0, they will be muted immediately on the 
  first violation. Without arguments shows the current settings value, with
  an argument -- sets it.

- /warnings_expiry [duration] - Set or view warnings expiration time

  Warnings automatically expire after predefined amount of time (3 hours 
  by default) -- meaning if a user hasn't performed any more violations in this
  time their transgressions are absolved. Without an argument it shows the 
  current expiry duration, with an argument -- sets it.

- /cooldown [duration] Set cooldown value for wrong language warnings

  If a bot issued a warning, it won't do so for some time. This time is common 
  for all users, meaning if user A got a warning, and user B started to write in 
  a wrong language he still won't receive a warning until this cooldown time will
  pass.
  
  Our goal isn't to ban everyone or spam with warnings and threats, but to 
  stimulate the language exchange.

  Without an argument displays the current cooldown value, with a value sets it.

- /captcha Toggle captcha check for newcomers on/off

  When enabled, new members must solve an arithmetic question to prove they're 
  not bots. Users who fail to answer within the time limit or fail 7 attempts 
  are banned.

- /captcha_time [duration] - Set or view time in which members must pass captcha

  Without arguments displays the current captcha verification time limit. With 
  duration argument sets the time limit for new members to solve the captcha 
  question (default: 20 minutes).

- /trust @username - Remove captcha check for a specific user

  Immediately removes captcha verification requirement for the specified user, 
  marking them as trusted. Useful for legitimate users who may have trouble 
  with the captcha system.

- /captcha_bots Toggle bots allowed on/off

  When disabled, all bots attempting to join the chat are automatically banned. 
  When enabled, bots are allowed to join without captcha verification. 
  

### Hidden admin commands

These commands are not displayed in the menu or help text. Know what you're doing
if you're using them.

- /flush_admins Invalidate admins cache. Admin list is cached for 3 hours. In 
  case you just added or removed an admin, and don't want to wait for his 
  permissions to be updated, you can force cache invalidation with this 
  command.

- /rt <text> - Retranslate text to chat (for fun and comedic purposes -- like 
  the bot says it).

## Language detection

The bot uses a two-tier language detection system built on the 
[lingua-rs](https://github.com/pemistahl/lingua-rs) library through 
a custom Rust/NAPI wrapper:

### Detection Methods

1. **Russian/English Detection** (`isRussianOrEnglish`)
  - Primary method for language policy enforcement
  - Only detects Russian and English languages (basically, anything 
    non-cyrillic will be treated as English)
  - Optimized for detecting direct policy violations
  - Used to determine if users are writing in the wrong language on 
    language-specific days

2. **Other Language Detection** (`detectOtherLanguage`)
  - Regex-based quick check for non-Russian/English text
  - Detects messages containing characters outside Cyrillic and Latin scripts
  - Used as a fast pre-filter before running Russian/English detection
  - Filters out kaomoji and other decorative characters to avoid false positives
  - When triggered, message language is marked as "other" without further processing

### Multi-Language Message Handling

When messages contain both Russian and English text, the bot uses a 
**rate-based approach** to determine the primary language -- based on the amount
of characters in each language in a message.

- **Language Rate Threshold**: 1.7x ratio required (`REQUIRED_LANGUAGE_RATE`)
- **Mixed Language Logic**: If neither language dominates by the required rate, 
  the message is considered "mixed language" and **no violation is triggered**
- **Calculation**: Based on character length of each language fragment in the message

**Examples**:
- Russian text 3x longer than English → Classified as Russian
- English text 2x longer than Russian → Classified as English  
- Russian and English roughly equal length → Mixed language (no violation)

The idea behind it -- if someone explains/translates something in both languages
simultaneously, we shouldn't give them a warning.

### Message Processing Rules

- **Only the target chat is checked**, i.e. if someone adds the bot to other 
  chats it won't actually do anything there, DMs aren't verified either
- **Non-letter characters are removed for a check**
- **Minimum Length**: Number of letter characters in a message be at least 5
  characters to trigger language detection 
- **Admin Immunity**: Chat administrators are exempt from language checks 
  (this includes admin-bots as well)
- **Age Filter**: Messages older than 5 minutes are ignored (handles missed 
  updates, if bot was down for some reason)

### Violation Process:

1. When a user violates language rules (posts in wrong language on 
  language-specific days), they get warnings
2. Each warning triggers a cooldown process -- for the cooldown duration time 
  no one will receive a new warning. (configurable with `/cooldown`)
3. Default: 3 warnings before mute (configurable with `/warnings_number`)
4. After reaching warning limit, user gets temporarily muted

Mute Details:
- Duration: 15 minutes by default, configurable with `/mute_duration`
- Restrictions: Can't send messages, media, polls, or other content (but can 
  invite users)
- Expiration: Violations expire after a set time -- 3 hours by default, 
  configurable with `/warnings_expiry`

The system only affects non-admin users and requires the mute capacity to be 
enabled.

Given a cooldown time common for all violations, and 3 warnings, bot shouldn't
really mute anyone all that often, it's more of a scare-tactic to show it has
teeth (otherwise users just ignore the bot).

## Captcha System

The bot includes an anti-spam captcha system to prevent bot accounts and 
spam. When enabled, new members must solve a simple arithmetic question to 
prove they're human.

### How It Works

1. **New Member Detection**: When someone joins the chat, the system detects 
   the new member through Telegram's chat member events
2. **Bot Handling**: If the new member is an official bot:
   - If bots are disabled (`/captcha_bots` off), the bot is immediately banned
   - If bots are enabled, they join without verification
3. **Human Verification**: For human users, the system:
   - Generates a simple arithmetic question (e.g., "What is 9 + 7?")
   - Posts the question mentioning the user in both English and Russian
   - Sets a timer for verification (default: 20 minutes)

### Verification Process

- **Message Deletion**: All messages from unverified users are automatically deleted
- **Answer Checking**: User messages are checked against the expected answer
- **Attempt Tracking**: Failed attempts are counted (max 7 attempts)
- **Progressive Warnings**: Every 3rd failed attempt repeats the same question,
  in case user missed the original one.
- **Timeout/Ban**: Users who exceed max attempts or don't respond in time are 
  banned
- **Success**: Correct answers immediately remove verification requirement

### Technical Implementation

The captcha system uses:
- **Automatic cleanup**: Old verification data expires after 1 day
- **Message tracking**: Captcha messages are tracked and can be cleaned up
- **Username mapping**: Bidirectional username↔userId mapping for admin commands
- **Background jobs**: Periodic cleanup of expired verifications
- **Error handling**: Graceful handling of message deletion failures

The system is disabled by default and must be explicitly enabled by admins.

## Storage:

The bot uses a hybrid storage approach with different data stored in memory vs Valkey:

### In Memory:
- **Chat Admin Cache** (`ChatAdminRepo`): Admin user IDs with 3-hour TTL, refreshed automatically when expired
- **Language Detection Models**: Loaded once at startup for performance
- **Forced language and disabled langday setting**
- Current active cooldown value

Data in memory doesn't survive bot re-deployments or start-stop cycles of 
course, it is ephemeral.

### In Valkey
- **User Violations**: Violation counters per user with configurable TTL
  - Key pattern: `enrule:violations:counter:{userId}` 
  - Username mapping: `enrule:violations:username:{username}` → userId
  - Reverse mapping: `enrule:violations:userid:{userId}` → username
  
  Bidirectional mapping needed because Telegram's API doesn't allow 
  username→userId lookup, but admins use `@username` in commands. 
  Reverse mapping for technical cleanup operations only.

- **Bot Settings**: Persistent configuration with defaults
  - Mute enabled/disabled: `enrule:violation_settings:mute_enabled` (default: true)
  - Max violations before mute: `enrule:violation_settings:max_violations` (default: 3)
  - Mute duration: `enrule:violation_settings:mute_duration` (default: 15 minutes)
  - Warnings expiry: `enrule:violation_settings:warnings_expiry` (default: 3 hours)
  - Cooldown duration: `enrule:cooldown:duration` (default: 2 minutes)

- **Captcha System**: Anti-spam verification for new members
  - Settings:
    - Captcha enabled/disabled: `enrule:captcha_settings:enabled` (default: false)
    - Bots allowed: `enrule:captcha_settings:bots_allowed` (default: false)
    - Max verification time: `enrule:captcha_settings:max_verification_age` (default: 20 minutes)
  - Per-user verification data (expires after 1 day):
    - Question: `enrule:captcha:question:{userId}`
    - Expected answer: `enrule:captcha:answer:{userId}`
    - Attempts counter: `enrule:captcha:attempts_counter:{userId}`
    - Message IDs (set): `enrule:captcha:msg_ids:{userId}`
    - First asked timestamp: `enrule:captcha:first_asked_at:{userId}`
    - Username bidirectional mapping:
      - `enrule:captcha:userid:{username}` → userId
      - `enrule:captcha:username:{userId}` → username

**Key Prefix**: All Valkey keys use `enrule:` prefix for namespace isolation.

**Client**: Uses Valkey Glide client with configurable host/port via environment
 variables (`VALKEY_HOST`, `VALKEY_PORT`).

## Build process.

Requires both rust and nodejs toolchains.

First, build language-detection (napi-rs requires yarn instead of npm):

```sh
cd packages/language-detection
yarn install
yarn run build
```

Now you can install dependencies 

```sh
cd ../../packages/tg-bot
npm i
```

and launch the bot:
```sh
npm run start
# or for hot reload and extra logs (with pretty print with pino-pretty):
# npm install -g pino-pretty # you need to install it once
npm run dev | pino-pretty
```

It requires a valkey instance, you can start one in docker:
```sh
docker run --name enrule_valkey -p 6379:6379 -d valkey/valkey valkey-server --save 60 1 --loglevel warning
```

## Configuration.

Bot can be configured through the environment variables, which can also be 
supplied through `.env` file.

At the very least, you must supply to variables:
- TOKEN Containing a bot token, as supplied by the [BotFather](https://t.me/BotFather)
- CHAT_ID Id of your chat/supergroup

Please refer to [env.d.ts](./packages/tg-bot/types/env.d.ts) file definitions 
for the full list of available options.

## License

EnRuLeBot is MIT Licensed.