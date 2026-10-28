# Running with systemd

The bot is a single binary (the language model is compiled in) with one
state file, so it runs fine as a plain systemd service, without Docker.

## Install

```sh
cargo build --release
sudo install -m 755 target/release/en_ru_le_bot /usr/local/bin/

sudo install -d -m 700 /etc/en_ru_le_bot
sudo install -m 600 /dev/null /etc/en_ru_le_bot/env
sudoedit /etc/en_ru_le_bot/env   # TOKEN=... and CHAT_ID=..., see env.example
```

## Unit

`/etc/systemd/system/en_ru_le_bot.service`:

```ini
[Unit]
Description=EnRuLeBot, Telegram bot for an English/Russian language exchange chat
Wants=network-online.target
After=network-online.target

[Service]
ExecStart=/usr/local/bin/en_ru_le_bot
EnvironmentFile=/etc/en_ru_le_bot/env
Restart=on-failure
RestartSec=10s
# The bot shuts down gracefully on SIGINT
KillSignal=SIGINT

DynamicUser=yes
# The bot keeps its state in $STATE_DIRECTORY/state.json,
# i.e. /var/lib/en_ru_le_bot/state.json; STATE_PATH overrides it
StateDirectory=en_ru_le_bot

# Light hardening, on top of what DynamicUser= implies
# (ProtectSystem=strict, ProtectHome=read-only, PrivateTmp=, NoNewPrivileges=, ...)
CapabilityBoundingSet=
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now en_ru_le_bot
journalctl -u en_ru_le_bot -f   # JSON logs, LOG_LEVEL=debug in the env file for more
```

## Notes

- With `DynamicUser=yes` the state actually lives in
  `/var/lib/private/en_ru_le_bot/`, `/var/lib/en_ru_le_bot` is a symlink to it.
  That's the only thing to back up.
- The state file is rewritten atomically (a temp file next to it, then a
  rename), so it's never left half-written.
- `AF_UNIX` is there for glibc's DNS resolution through systemd-resolved.
- After an update, `install` the new binary and `systemctl restart en_ru_le_bot`.
