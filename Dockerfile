# ── Stage 1: Build ──
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies (leverage Docker cache)
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# Copy source
COPY packages/shared packages/shared
COPY packages/backend packages/backend
COPY packages/frontend packages/frontend

# Generate Prisma client
RUN npx prisma generate --schema=packages/backend/prisma/schema.prisma

# Build shared package first — backend + frontend both import @oscarr/shared compiled to JS.
RUN npm run build --workspace=packages/shared

# Build backend (TypeScript → dist/)
RUN npm run build --workspace=packages/backend

# Build frontend (Vite → dist/)
RUN npm run build --workspace=packages/frontend

# ── Stage 2: Production ──
FROM node:22-alpine

# tini = minimal init system. Docker's default PID 1 doesn't forward SIGTERM/SIGINT to child
# processes cleanly; tini handles signal propagation + zombie reaping so a `docker stop` gives
# Fastify a chance to close connections + flush Prisma before it's killed.
# wget is used by HEALTHCHECK (already in busybox, listed here for clarity).
RUN apk add --no-cache tini wget

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev

# Copy the shared package's compiled dist/ from the builder stage — backend's dist/ imports
# @oscarr/shared at runtime and resolves via the workspace symlink npm ci just created.
COPY --from=builder /app/packages/shared/dist packages/shared/dist

# Copy Prisma schema, migrations, generated client + CLI (needed for migrate deploy)
COPY packages/backend/prisma packages/backend/prisma
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client node_modules/@prisma/client
COPY --from=builder /app/node_modules/prisma node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines node_modules/@prisma/engines

# Copy built backend
COPY --from=builder /app/packages/backend/dist packages/backend/dist

# Copy built frontend
COPY --from=builder /app/packages/frontend/dist packages/frontend/dist

# Copy root package.json (needed for version check)
COPY package.json .

# Create data directory for SQLite + a dedicated non-root user owning the app + data dirs.
# Using addgroup/adduser (not `adduser -D -u 1001`) so we get a reproducible UID across
# rebuilds, and ownership covers both /app (where migrations + Prisma client live) and /data
# (SQLite file, install.json, backups). `--omit=dev` was already run as root, so installed
# modules are readable by oscarr.
RUN addgroup -S -g 1001 oscarr \
 && adduser -S -G oscarr -u 1001 oscarr \
 && mkdir -p /data \
 && chown -R oscarr:oscarr /app /data

USER oscarr

ENV NODE_ENV=production
ENV DATABASE_URL=file:///data/oscarr.db
ENV PORT=3456

EXPOSE 3456

# Container is alive as long as /install-status answers 2xx (it's always mounted, post-install
# or not — see routes/setup.ts). 30s grace at startup to cover prisma migrate deploy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:3456/api/setup/install-status || exit 1

# tini reaps PID 1 + forwards signals; exec-form CMD so `docker stop` hits node directly
# instead of /bin/sh. The migrate-deploy step moved inside node's boot (see ensureMigrated()
# in src/index.ts) so we don't need a shell chain here anymore.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "packages/backend/dist/index.js"]
