# Stage 1: Build language-detection (Rust/NAPI)
FROM rust:1.88 AS language-detection-builder

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_26.x | bash - && \
    apt-get install -y nodejs=26.12.1-1nodesource1

WORKDIR /app

# Workspace manifests, so npm ci can validate the root lockfile
COPY package.json package-lock.json ./
COPY packages/tg-bot/package.json ./packages/tg-bot/
COPY packages/language-detection/package.json ./packages/language-detection/
RUN npm ci -w packages/language-detection

# Copy language-detection sources
COPY packages/language-detection/Cargo.toml packages/language-detection/Cargo.lock packages/language-detection/build.rs ./packages/language-detection/
COPY packages/language-detection/src ./packages/language-detection/src
COPY packages/language-detection/.cargo ./packages/language-detection/.cargo

RUN npm run build -w packages/language-detection

# Stage 2: Node.js dependencies installation
FROM node:26.12.1-slim AS deps

# Create app directory
WORKDIR /app

# Copy root package.json and install workspace dependencies
COPY package.json package-lock.json* ./
COPY packages/tg-bot/package.json ./packages/tg-bot/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 3: Final distroless production image
FROM gcr.io/distroless/nodejs26-debian13:nonroot AS production
LABEL org.opencontainers.image.source=https://github.com/religiosa1/en_ru_le_bot
LABEL org.opencontainers.image.description="Node.js Telegram bot for a language exchange chat."
LABEL org.opencontainers.image.licenses=MIT

# Create app directory
WORKDIR /app

# Copy node_modules and package files from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/packages/tg-bot/package.json ./packages/tg-bot/package.json

# Copy built language-detection artifacts from Stage 1
COPY --from=language-detection-builder /app/packages/language-detection/index.js ./packages/language-detection/
COPY --from=language-detection-builder /app/packages/language-detection/index.d.ts ./packages/language-detection/
COPY --from=language-detection-builder /app/packages/language-detection/*.node ./packages/language-detection/
COPY --from=language-detection-builder /app/packages/language-detection/package.json ./packages/language-detection/

# Copy tg-bot source code
COPY packages/tg-bot ./packages/tg-bot

# Distroless images run as nonroot by default, no user setup needed

# Set working directory to tg-bot
WORKDIR /app/packages/tg-bot

# Environment variables
ENV NODE_ENV=production
ENV VALKEY_HOST=localhost
ENV VALKEY_PORT=6379

# Start the application
CMD ["src/index.ts"]