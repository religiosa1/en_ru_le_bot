FROM rust:1.95-slim-trixie AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src src
COPY examples examples
COPY words words
COPY models/lid-chat.ftz models/
RUN cargo build --release --locked

FROM gcr.io/distroless/cc-debian13:nonroot
LABEL org.opencontainers.image.source=https://github.com/religiosa1/en_ru_le_bot
LABEL org.opencontainers.image.description="Telegram bot for an English/Russian language exchange chat."
LABEL org.opencontainers.image.licenses=MIT

COPY --from=build /app/target/release/en_ru_le_bot /usr/local/bin/en_ru_le_bot
ENV STATE_PATH=/data/state.json
VOLUME /data
# The bot shuts down gracefully on SIGINT
STOPSIGNAL SIGINT
ENTRYPOINT ["/usr/local/bin/en_ru_le_bot"]
