-- CreateTable
CREATE TABLE "AuthProviderSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthProviderSettings_provider_key" ON "AuthProviderSettings"("provider");

-- Backfill: email is always present + enabled (was hardcoded before this migration).
INSERT INTO "AuthProviderSettings" ("provider", "enabled", "config", "updatedAt")
VALUES ('email', 1, '{}', CURRENT_TIMESTAMP);

-- Backfill: plex/jellyfin/emby inherit enabled from their matching Service row at migration time.
-- After this, enablement is owned by AuthProviderSettings and decoupled from Service.
INSERT INTO "AuthProviderSettings" ("provider", "enabled", "config", "updatedAt")
SELECT s.type, s.enabled, '{}', CURRENT_TIMESTAMP
FROM "Service" s
WHERE s.type IN ('plex', 'jellyfin', 'emby')
ON CONFLICT(provider) DO NOTHING;
