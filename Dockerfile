# Stage 1: Build language-detection (Rust/NAPI)
FROM rust:1.88 AS language-detection-builder

# Install Node.js and yarn
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    corepack enable

# Set working directory for language-detection
WORKDIR /app/packages/language-detection

# Copy language-detection package files
COPY packages/language-detection/package.json packages/language-detection/yarn.lock* ./
COPY packages/language-detection/.yarnrc.yml ./
COPY packages/language-detection/.yarn ./.yarn
COPY packages/language-detection/Cargo.toml packages/language-detection/Cargo.lock ./
COPY packages/language-detection/build.rs ./
COPY packages/language-detection/src ./src
COPY packages/language-detection/.cargo ./.cargo

# Install dependencies and build
RUN yarn install --frozen-lockfile
RUN yarn build

# Stage 2: Node.js dependencies installation
FROM node:24-slim AS deps

# Create app directory
WORKDIR /app

# Copy root package.json and install workspace dependencies
COPY package.json package-lock.json* ./
COPY packages/tg-bot/package.json ./packages/tg-bot/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 3: Final distroless production image
FROM gcr.io/distroless/nodejs24-debian12:nonroot AS production
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