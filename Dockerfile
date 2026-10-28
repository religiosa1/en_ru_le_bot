# Stage 1: Node.js dependencies installation
FROM node:26.12.1-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Tongue weights ship inside its npm package, so they're baked into the image.
# Loading them once here fails the build, rather than the bot startup, if they're broken.
RUN node --input-type=module -e "const { Tongue } = await import('@desert-ant-labs/tongue'); await Tongue.load();"

# Stage 2: Final distroless production image
FROM gcr.io/distroless/nodejs26-debian13:nonroot AS production
LABEL org.opencontainers.image.source=https://github.com/religiosa1/en_ru_le_bot
LABEL org.opencontainers.image.description="Node.js Telegram bot for a language exchange chat."
LABEL org.opencontainers.image.licenses=MIT

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Distroless images run as nonroot by default, no user setup needed

ENV NODE_ENV=production
ENV VALKEY_HOST=localhost
ENV VALKEY_PORT=6379

CMD ["src/index.ts"]
