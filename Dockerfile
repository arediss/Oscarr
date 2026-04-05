# ── Stage 1: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (leverage Docker cache)
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN npm ci

# Copy source
COPY packages/backend packages/backend
COPY packages/frontend packages/frontend

# Generate Prisma client
RUN npx prisma generate --schema=packages/backend/prisma/schema.prisma

# Build backend (TypeScript → dist/)
RUN npm run build --workspace=packages/backend

# Build frontend (Vite → dist/)
RUN npm run build --workspace=packages/frontend

# ── Stage 2: Production ──
FROM node:20-alpine
WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN npm ci --omit=dev

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

# Create data directory for SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATABASE_URL=file:///data/oscarr.db
ENV PORT=3456

EXPOSE 3456

# Apply pending migrations + start
CMD npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma && \
    node packages/backend/dist/index.js
