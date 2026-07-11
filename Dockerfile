# ── Builder stage ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install ALL dependencies (next build needs devDependencies too)
COPY package.json package-lock.json ./
RUN npm ci

# Create placeholder paths so config validation passes during build.
# The real data files are mounted at runtime via docker-compose volumes.
RUN mkdir -p /data/obsidian && touch /data/finance.db

# Copy source and create public dir (some Next.js projects omit it)
COPY . .
RUN mkdir -p public
ENV FINANCE_DB_PATH=/data/finance.db
ENV OBSIDIAN_VAULT_PATH=/data/obsidian
RUN npm run build


# ── Runner stage ────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Create non‑root user
RUN addgroup -g 1001 -S nodegroup && \
    adduser  -u 1001 -S nodeuser -G nodegroup

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package manifests and install PRODUCTION dependencies only.
# Next.js needs TypeScript to load next.config.ts even in production.
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save --save-exact typescript@5.8.3

# Copy build artifacts and static assets
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Create mount-point directories for runtime volumes
RUN mkdir -p /data/obsidian && touch /data/finance.db && chown -R nodeuser:nodegroup /data

# Switch to non‑root user
USER nodeuser

# Health check (Next.js serves on PORT; curl confirms liveness)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:${PORT:-3003}/api/health || exit 1

EXPOSE 3003

ENV PORT=3003
ENV NODE_ENV=production

CMD ["npm", "start"]
