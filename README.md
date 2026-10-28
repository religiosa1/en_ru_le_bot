# EnRuLeBot

Telegram bot for an en-ru language exchange group chat.

Enforces the usage of one of those two languages on different days of the week.

Written in Rust using [teloxide](https://github.com/teloxide/teloxide), with
its own small [fastText](https://fasttext.cc/) language detection model,
trained on the chat history. It's a single ~13 MiB binary (the model is
compiled in) keeping its state in one JSON file, no database required.

## List of commands available to bot

Commands are just messages in the chat, starting with a `/` character.
A command must be first part of the message and may be followed by bot user
handle (e.g. `/help@en_ru_le_bot`) and/or arguments (e.g. `/help members`).

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

### Public Commands (Available to all users)

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

- /langchecks Toggle en/ru language checks on/off

  Enables/disables checks of usage of english on russian days and vice versa.

- /otherlang Toggle checks for languages outside en/ru on/off

  Enables/Disables check for message language being outside of en or ru

  If both langchecks and otherlang are disabled, bot won't check message
  language, or send notifications about day changes. The bot, will continue to
  do captcha checks, display rules, accept commands, etc.

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

  Pardoned users get all chat permissions restored, even if they were only
  warned. This also lifts the newcomers' probation restrictions.

- /mute_duration [duration] - Set or view mute duration

  Without arguments displays the current mute duration value -- for how long
  users' permissions will be restricted so they can't post, after repeated
  violations. With the argument sets this value, between 30 seconds and 366
  days (Telegram makes shorter or longer restrictions permanent).

- /warnings_number [int] - Set or view number of warnings before mute

  The amount of warnings user must receive before his permissions are
  temporarily restricted. If set to 0, they will be muted immediately on the
  first violation. Without arguments shows the current settings value, with
  an argument -- sets it.

- /warnings_expiry [duration] - Set or view warnings expiration time

  Warnings automatically expire after predefined amount of time (3 hours
  by default) -- meaning if a user hasn't performed any more violations in this
  time their transgressions are absolved. Without an argument it shows the
  current expiry duration, with an argument -- sets it (1 minute to 366 days).

- /cooldown [duration] Set cooldown value for wrong language warnings

  If a bot issued a warning, it won't do so for some time. This time is common
  for all users, meaning if user A got a warning, and user B started to write in
  a wrong language he still won't receive a warning until this cooldown time will
  pass.

  Our goal isn't to ban everyone or spam with warnings and threats, but to
  stimulate the language exchange.

  Without an argument resets the cooldown to its default value (2 minutes) and
  ends the current one, with a value sets it (up to 3 hours).

- /captcha Toggle captcha check for newcomers on/off

  When enabled, new members must solve an arithmetic question to prove they're
  not bots. Users who fail to answer within the time limit or fail 7 attempts
  are banned.

- /captcha_time [duration] - Set or view time in which members must pass captcha

  Without arguments displays the current captcha verification time limit. With
  duration argument sets the time limit for new members to solve the captcha
  question (default: 20 minutes, 1 minute to 1 day).

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

- /rt &lt;text> - Retranslate text to chat (for fun and comedic purposes -- like
  the bot says it).

- /captcha_msg Show the captcha and welcome messages in the current chat, to
  check their formatting.

- /captcha_clear Remove all pending captcha checks.

## Language detection

The bot uses a two-tier language detection system, with its own small
fastText model (~1.3 MiB), trained on the chat history, for the ML part. How it's
trained and evaluated is described in
[docs/language-detection.md](docs/language-detection.md).

### Accuracy

Measured on 2000 random messages from 2026 (not used in training), labelled
by an LLM reviewer that never saw any detector's verdict. Each message is checked
as if it were sent on an English day:

| Detector | English wrongly flagged as other language | Russian wrongly flagged | Real other-language messages caught |
|---|---|---|---|
| [tongue](https://desertant.com/models/tongue/) | 6 / 1396 (0.4%) | 3 / 552 | 4 / 10 |
| [lingua-rs](https://github.com/pemistahl/lingua-rs) | 11 / 1396 (0.8%) | 9 / 552 | 4 / 10 |
| **this bot's model** | **1 / 1396 (0.07%)** | **0 / 552** | **7 / 10** |

Of all "other language" verdicts over the whole of 2026 (61.7k checked
messages), ~81% are right; most of the wrong ones are lone names or places.
For comparison, the same pipeline flags 591 messages with tongue and 921 with
lingua, against 122 with this model.

### Detection Methods

1. **Russian/English Detection** (`detect_en_ru`)

- Primary method for language policy enforcement
- Only detects Russian and English languages, by counting Cyrillic and Latin
  letters (basically, anything non-cyrillic will be treated as English)
- Optimized for detecting direct policy violations
- Used to determine if users are writing in the wrong language on
  language-specific days

2. **Other Language Detection** (`detect_other_language`)

- Multi-layered approach combining regex and ML detection for
  non-Russian/English text
- **Layer 1 - Character Set Detection**: Regex-based quick check for characters outside
  Cyrillic and Latin scripts (e.g., Chinese, Arabic)
- **Layer 2 - ML Language Detection**: the chat model classifies the message as
  English, Russian, transliterated Russian or other, "other" needs 0.7
  confidence. Messages of up to 5 words that are all capitalized are skipped,
  as they're usually names or places ("Harley Quinn", "Campinas - Brazil")
- **Layer 3 - Dictionary Validation**: Cross-references detected words against
  5000 most common English and Russian words to reduce false positives
- Requires >60% unknown words to confirm non-English/Russian classification
- When triggered, message language is marked as "other" without further processing

### Multi-Language Message Handling

When messages contain both Russian and English text, the bot uses a
**rate-based approach** to determine the primary language -- based on the amount
of characters in each language in a message.

- **Language Rate Threshold**: 1.7x ratio required (`REQUIRED_LANGUAGE_RATE`)
- **Mixed Language Logic**: If neither language dominates by the required rate,
  the message is considered "mixed language" and **no violation is triggered**
- **Calculation**: Based on the number of Cyrillic and Latin letters in the message

**Examples**:

- Russian text 3x longer than English → Classified as Russian
- English text 2x longer than Russian → Classified as English
- Russian and English roughly equal length → Mixed language (no violation)

The idea behind it -- if someone explains/translates something in both languages
simultaneously, we shouldn't give them a warning.

### Message Processing Rules

- **Target chat filtering**: The bot ensures all
  processing (language detection, captcha, probation) only occurs in the configured
  target chat. If someone adds the bot to other chats it won't do anything there,
  DMs aren't verified either
- **Non-letter characters are removed for a check**
- **Minimum Length**: Number of letter characters in a message be at least 5
  characters to trigger language detection
- **Admin Immunity**: Chat administrators are exempt from language checks
  (this includes admin-bots as well)
- **Age Filter**: Messages older than 5 minutes are ignored (handles missed
  updates, if bot was down for some reason)

### Violation Process

1. When a user violates language rules (posts in wrong language on
   language-specific days), they get warnings
2. Each warning triggers a cooldown process -- for the cooldown duration time
   no one will receive a new warning. (configurable with `/cooldown`)
3. Default: 2 warnings before mute (configurable with `/warnings_number`)
4. After reaching warning limit, user gets temporarily muted

Mute Details:

- Duration: 15 minutes by default, configurable with `/mute_duration`
- Restrictions: Can't send messages, media, polls, or other content (but can
  invite users)
- Expiration: Violations expire after a set time -- 3 hours by default,
  configurable with `/warnings_expiry`

The system only affects non-admin users and requires the mute capacity to be
enabled.

Given a cooldown time common for all violations, and 2 warnings, bot shouldn't
really mute anyone all that often, it's more of a scare-tactic to show it has
teeth (otherwise users just ignore the bot).

## Anti-Spam Systems

The bot includes multiple anti-spam systems to prevent bot accounts and
unwanted behavior:

### Probation System

All new members are automatically placed under a probation period when they join:

- **Duration**: 1 day (24 hours)
- **Restrictions**: New members can only send text messages during probation
- **Disabled capabilities**: Photos, videos, documents, audio, polls, stickers,
  animations, voice notes, and web page previews
- **Permissions retained**: Can invite other users and send basic text messages
- **Automatic**: Applied to all new members without any manual intervention

### Captcha System

The bot also includes an optional captcha system that can be enabled separately.
When enabled, new members must solve a simple arithmetic question to
prove they're human.

### How Captcha Works

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

Captcha checks are on by default, `/captcha` toggles them. The probation
system is always active for new members.

## Storage

All persistent data lives in a single JSON file (`STATE_PATH`), rewritten
atomically on every change:

- settings, with defaults for anything missing, so the file can be edited by
  hand (durations are strings like `"15m"`);
- violation counters per user, with usernames, so admins can `/pardon @user`;
- pending captcha checks.

Violations and captcha checks carry an expiry timestamp and are dropped once
expired. Admin list cache (3 hours), the current cooldown and the welcome
message counter are kept in memory only.

## Building and running

```sh
cargo build --release
TOKEN=... CHAT_ID=... ./target/release/en_ru_le_bot
```

Requires a recent stable Rust (2024 edition). `cargo test` runs the test suite.

- **systemd**: see [docs/systemd.md](docs/systemd.md) for a hardened unit.
- **Docker**: `docker compose up --build -d`, with `TOKEN` and `CHAT_ID` in
  `.env`. The state is kept in the `bot_data` volume.

The bot shuts down gracefully on SIGINT.

## Configuration

Environment variables (see [env.example](env.example)):

- `TOKEN` bot token, as supplied by the [BotFather](https://t.me/BotFather)
- `CHAT_ID` id of your chat/supergroup
- `STATE_PATH` state file, defaults to `$STATE_DIRECTORY/state.json` when run
  with systemd's `StateDirectory=`, and to `data/state.json` otherwise
- `LOG_LEVEL` log filter, `info` by default (e.g. `debug`, or
  `en_ru_le_bot=debug,warn`); logs are JSON lines on stdout

## License

EnRuLeBot is MIT Licensed.

The `other` class of the language model is trained on
[Tatoeba](https://tatoeba.org) sentences (CC-BY 2.0 FR).

