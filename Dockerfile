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

# Build shared first — backend + frontend both import @oscarr/shared compiled to JS.
RUN npm run build --workspace=packages/shared

# Bundle backend into a single dist/server.js (~2.8 MB). Natives (bcrypt, bare-*) + Prisma stay
# external — they need real files on disk. See esbuild.config.mjs for the externals list.
RUN npm run build:bundle --workspace=packages/backend

# Build frontend
RUN npm run build --workspace=packages/frontend

# ── Stage 2: Production ──
FROM node:22-alpine

# tini = PID 1 init (signal forwarding + zombie reaping).
# su-exec = drop from root → oscarr in the entrypoint after chowning /data.
# wget = HEALTHCHECK binary (already in busybox, listed here for clarity).
RUN apk add --no-cache tini su-exec wget

# Create the non-root user BEFORE any COPY so --chown=oscarr:oscarr on the COPY lines
# bakes ownership into each layer without a 300+ MB post-copy `chown -R`.
RUN addgroup -S -g 1001 oscarr \
 && adduser -S -G oscarr -u 1001 oscarr \
 && mkdir -p /data \
 && chown oscarr:oscarr /data

WORKDIR /app

# Install ONLY the runtime externals (Prisma + native modules) from a trimmed manifest.
# Everything else (fastify, axios, archiver, swagger, zod, …) is inlined in dist/server.js.
# This is the 500+ MB image-slimming win vs shipping the full `npm ci --omit=dev` tree.
# We then strip the bundled npm CLI: ensureMigrated() now calls node_modules/.bin/prisma
# directly (not via npx), so npm isn't needed at runtime — and its transitive deps regularly
# ship vulns the scanner picks up.
COPY --chown=oscarr:oscarr packages/backend/package.prod.json packages/backend/package.json
RUN cd packages/backend && npm install --omit=dev --no-audit --no-fund \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Bundled backend server + its sourcemap (keeps stack traces useful in prod logs).
COPY --from=builder --chown=oscarr:oscarr /app/packages/backend/dist/server.js packages/backend/dist/server.js
COPY --from=builder --chown=oscarr:oscarr /app/packages/backend/dist/server.js.map packages/backend/dist/server.js.map

# Frontend bundle served by @fastify/static from the bundled backend.
COPY --from=builder --chown=oscarr:oscarr /app/packages/frontend/dist packages/frontend/dist

# Prisma schema + migrations: the bundled server still shells out to `prisma migrate deploy`
# on boot, so the schema and migrations folder need to be on disk.
COPY --chown=oscarr:oscarr packages/backend/prisma packages/backend/prisma

# Prisma generated client + platform-specific engines, copied from the builder (they were
# generated there during `prisma generate`).
COPY --from=builder --chown=oscarr:oscarr /app/node_modules/.prisma packages/backend/node_modules/.prisma

# Root package.json used by src/routes/app.ts + services/backupService.ts for the app version.
COPY --chown=oscarr:oscarr package.json .

# Entrypoint: chown /data (covers upgrade from pre-1001 volumes + host bind mounts) then
# su-exec oscarr. Kept as root so it can chown; drops privileges before exec-ing CMD.
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/oscarr.db
# install.json lives next to the SQLite DB in the persisted volume — the default `./data/…` is
# relative to the container's cwd (/app) and ends up in the ephemeral writable layer, which
# means the flag is lost on every container recreate (image upgrade, admin restart, …) and the
# install wizard shows up again on an already-installed instance.
ENV INSTALL_FILE_PATH=/data/install.json
ENV PORT=3456

EXPOSE 3456

# /install-status is always mounted (setup.ts). 30s grace at startup covers prisma migrate deploy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:3456/api/setup/install-status || exit 1

# tini → entrypoint.sh → node as oscarr. Exec-form throughout so docker stop propagates SIGTERM.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "packages/backend/dist/server.js"]
