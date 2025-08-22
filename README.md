# EnRuLeBot monorepo

Consists of two packages:
- language detection module ([napi-rs](https://napi.rs/) wrapper around 
  [lingua-rs](https://github.com/pemistahl/lingua-rs))
- the actual telegram bot, written in nodejs

More details in the corresponding repos.

## List of commands available to bot.

###  Public Commands (Available to all users)

  - /rules - Display chat rules
  - /help - Show help message (extended for admins)
  - /today - Check current language day status
  - /cooldown - Show cooldown information and remaining time

### Admin-Only Commands

  - /info - Get user and chat IDs
  - /version - Show bot version
  - /flush - Refresh admin list from chat
  - /autolangday - Toggle automatic language day scheduling
  - /forcelang [EN|RU] - Force specific language or check current forced language
  - /set_cooldown [minutes] - Set violation cooldown (0-150 minutes) or reset cooldown
  - /threshold [0-1] - Set or view language detection threshold
  - /badchars [number] - Set or view allowed bad character count (0-150)
  - /mute - Toggle mute capacity on/off
  - /alarm [?] - Toggle daily notifications or check status
  - /pardon [@user] - Remove violations for specific user or all users
  - /mute_duration [minutes] - Set or view mute duration
  - /mute_expiration [minutes] - Set or view mute expiration time
  - /mute_warnings [number] - Set or view number of warnings before mute
  - /mute_score - Display all user violation scores (console output)
  - /rt <text> - Retranslate text to chat

### Violation Process:
  1. When a user violates language rules (posts in wrong language on language-specific days), they get warnings
  2. Default: 3 warnings before mute (configurable with /mute_warnings)
  3. After reaching warning limit, user gets temporarily muted

  Mute Details:
  - Duration: 180 minutes (3 hours) by default, configurable with /mute_duration
  - Restrictions: Can't send messages, media, polls, or other content (but can invite users)
  - Expiration: Violations expire after a set time (configurable with /mute_expiration)

  Admin Controls:
  - /mute - Toggle mute system on/off
  - /pardon [@user] - Remove violations for specific user or all users
  - /mute_score - View all user violation counts

  Code Implementation:
  - Violations stored in UserViolationStorage (src/components/user-violation-storage.js)
  - Muting handled via Telegram's restrictChatMember API (src/interfaces/user-violation-interface.js:15-27)
  - Automatic cleanup removes violation history after muting

  The system only affects non-admin users and requires the mute capacity to be enabled.

### Storage:

Storage Types in This Bot

  1. Redis Database

  Primary storage for user violations (src/components/user-violation-storage.js:3)
  - Purpose: Track user language violations and warnings
  - Data stored:
    - User violation counts (violationcounter:user:{userId})
    - Username-to-userId mappings (violationcounter:username:{username})
  - Features:
    - Automatic expiration (default: 5 minutes, configurable)
    - Key-based storage with prefixes
    - Async operations with promisified Redis client

  2. In-Memory Storage

  Admin list (src/components/admin-validator.js:14)
  - Purpose: Cache admin user IDs for permission checking
  - Data stored: Set of admin user IDs
  - Sources:
    - Environment variable ADMINS (static admins)
    - Telegram chat administrators (dynamic, refreshed via /flush)

  Language checker state (src/components/language-checker.js:32-36)
  - Purpose: Runtime configuration and state
  - Data stored:
    - Language detection options (threshold, cooldown, etc.)
    - Forced language setting
    - Cooldown timestamps
    - Day-of-week language rules

  3. Environment Variables

  Configuration storage
  - Bot settings (TOKEN, CHAT_ID, ADMINS, TIMEZONE, URL, etc.)
  - No persistent file storage - all data is either in Redis or memory
