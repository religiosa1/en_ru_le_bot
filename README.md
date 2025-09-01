# EnRuLeBot monorepo

Telegram bot for a en-ru language exchange group chat.

Enforces the usage of one of those two languages on different days of the week.

Consists of two packages:
- [language detection](./packages/language-detection/) ([napi-rs](https://napi.rs/) 
  rust wrapper around [lingua-rs](https://github.com/pemistahl/lingua-rs))
- the actual [telegram bot](./packages/tg-bot/), written in nodejs using
  [grammy](https://grammy.dev/). Requires node v24 or higher, as well as 
  [valkey](https://valkey.io/) instance for storage.

## List of commands available to bot.

###  Public Commands (Available to all users)

  - /today - Check current language day status
- ~~/rules - Display chat rules~~ removed, as it's now handled by shieldy.
    TODO:
  - /help - Show help message

### Admin-Only Commands

  - /flush - Refresh admin list from chat
  - /langchecks - Toggle automatic language day scheduling
  - /forcelang [en|ru] - Force specific language or check current forced language
  - /cooldown [duration] - Set violation cooldown (0-150 minutes) or reset cooldown
  - /mute - Toggle mute system on/off
  - /pardon [@user] - Remove violations for specific user or all users
  - /mute_duration [duration] - Set or view mute duration
  - /warnings_expiry [duration] - Set or view warnings expiration time
  - /warnings_number [int] - Set or view number of warnings before mute

    TODO:
  - /alarm [?] - Toggle daily notifications or check status
  - /rt <text> - Retranslate text to chat

### Violation Process:
  1. When a user violates language rules (posts in wrong language on language-specific days), they get warnings
  2. Default: 3 warnings before mute (configurable with `/warnings_number`)
  3. After reaching warning limit, user gets temporarily muted

  Mute Details:
  - Duration: 180 minutes (3 hours) by default, configurable with `/mute_duration`
  - Restrictions: Can't send messages, media, polls, or other content (but can invite users)
  - Expiration: Violations expire after a set time (configurable with `/mute_duration`)

  The system only affects non-admin users and requires the mute capacity to be enabled.

### Storage:

The bot uses a hybrid storage approach with different data stored in memory vs Valkey (Redis):

#### In Memory:
- **Chat Admin Cache** (`ChatAdminRepo`): Admin user IDs with 3-hour TTL, refreshed automatically when expired
- **Language Detection Models**: Loaded once at startup for performance

#### In Valkey/Redis:
- **User Violations**: Violation counters per user with configurable TTL
  - Key pattern: `enrule:violations:counter:{userId}` 
  - Username mapping: `enrule:violations:username:{username}` → userId
  - Reverse mapping: `enrule:violations:userid:{userId}` → username
  - Bidirectional mapping needed because Telegram's API doesn't allow username→userId lookup, but admins use `@username` in commands. Reverse mapping for technical cleanup operations only.
- **Bot Settings**: Persistent configuration with defaults
  - Mute enabled/disabled: `enrule:violation_settings:mute_enabled` (default: true)
  - Max violations before mute: `enrule:violation_settings:max_violations` (default: 3)
  - Mute duration: `enrule:violation_settings:mute_duration` (default: 5 minutes)
  - Warnings expiry: `enrule:violation_settings:warnings_expiry` (default: 3 hours)

**Key Prefix**: All Redis keys use `enrule:` prefix for namespace isolation.

**Client**: Uses Valkey Glide client with configurable host/port via environment variables (`VALKEY_HOST`, `VALKEY_PORT`).

## Build process.

Requires both rust and nodejs toolchains.

First, build language-detection:

```sh
cd packages/language-detection
npm run build
```

Now you can install dependencies and launch the bot:

```sh
cd ../../packages/tg-bot
npm i
```

It requires a valkey instance, you can start one in docker:
```sh
docker run --name enrule_valkey -d valkey/valkey valkey-server --save 60 1 --loglevel warning
```