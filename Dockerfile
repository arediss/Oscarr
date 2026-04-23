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
RUN npm run build --workspace=packages/backend
RUN npm run build --workspace=packages/frontend

# ── Stage 2: Production ──
FROM node:22-alpine

# tini = PID 1 init (signal forwarding + zombie reaping).
# su-exec = drop from root → oscarr in the entrypoint after chowning /data.
# wget = HEALTHCHECK binary (already in busybox, listed here for clarity).
RUN apk add --no-cache tini su-exec wget

# Create the non-root user BEFORE any COPY so --chown=oscarr:oscarr on the COPY lines
# bakes ownership into each layer without a 300+ MB post-copy `chown -R` that would
# duplicate every file via Docker's COW filesystem.
RUN addgroup -S -g 1001 oscarr \
 && adduser -S -G oscarr -u 1001 oscarr \
 && mkdir -p /data \
 && chown oscarr:oscarr /data

WORKDIR /app

# Install prod deps. npm workspaces hoists all subtrees into the root node_modules, and the
# lockfile doesn't differentiate by workspace — so `--workspace=backend` doesn't actually
# skip the frontend tree's hoisted deps. Image slimming (drop frontend-only deps, prune
# @prisma size, etc.) is tracked as a follow-up; current size ≈ 1.35 GB post --chown optim.
COPY --chown=oscarr:oscarr package.json package-lock.json ./
COPY --chown=oscarr:oscarr packages/backend/package.json packages/backend/
COPY --chown=oscarr:oscarr packages/frontend/package.json packages/frontend/
COPY --chown=oscarr:oscarr packages/shared/package.json packages/shared/
RUN npm ci --omit=dev

# Copy the built shared package + backend dist + frontend dist + prisma bits from the
# builder. --chown= avoids the duplicate-files-in-new-layer cost of a post-copy chown -R.
COPY --from=builder --chown=oscarr:oscarr /app/packages/shared/dist packages/shared/dist
COPY --from=builder --chown=oscarr:oscarr /app/packages/backend/dist packages/backend/dist
COPY --from=builder --chown=oscarr:oscarr /app/packages/frontend/dist packages/frontend/dist
COPY --chown=oscarr:oscarr packages/backend/prisma packages/backend/prisma
COPY --from=builder --chown=oscarr:oscarr /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder --chown=oscarr:oscarr /app/node_modules/@prisma/client node_modules/@prisma/client
COPY --from=builder --chown=oscarr:oscarr /app/node_modules/prisma node_modules/prisma
COPY --from=builder --chown=oscarr:oscarr /app/node_modules/@prisma/engines node_modules/@prisma/engines

# Root package.json (version probe uses it at runtime).
COPY --chown=oscarr:oscarr package.json .

# Entrypoint: chown /data (covers upgrade from pre-1001 volumes + host bind mounts) then
# su-exec oscarr. Kept as root so it can chown; drops privileges before exec-ing CMD.
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/oscarr.db
ENV PORT=3456

EXPOSE 3456

# /install-status is always mounted (setup.ts). 30s grace at startup covers prisma migrate deploy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:3456/api/setup/install-status || exit 1

# tini → entrypoint.sh → node as oscarr. Exec-form throughout so docker stop propagates SIGTERM.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "packages/backend/dist/index.js"]
