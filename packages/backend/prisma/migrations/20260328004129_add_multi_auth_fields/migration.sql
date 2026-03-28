-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "defaultQualityProfile" INTEGER,
    "defaultMovieFolder" TEXT,
    "defaultTvFolder" TEXT,
    "defaultAnimeFolder" TEXT,
    "plexMachineId" TEXT,
    "lastRadarrSync" DATETIME,
    "lastSonarrSync" DATETIME,
    "syncIntervalHours" INTEGER NOT NULL DEFAULT 6,
    "discordWebhookUrl" TEXT,
    "telegramBotToken" TEXT,
    "telegramChatId" TEXT,
    "resendApiKey" TEXT,
    "resendFromEmail" TEXT,
    "resendToEmail" TEXT,
    "notificationMatrix" TEXT,
    "incidentBanner" TEXT,
    "autoApproveRequests" BOOLEAN NOT NULL DEFAULT false,
    "requestsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supportEnabled" BOOLEAN NOT NULL DEFAULT true,
    "calendarEnabled" BOOLEAN NOT NULL DEFAULT true,
    "siteName" TEXT NOT NULL DEFAULT 'Oscarr',
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("autoApproveRequests", "calendarEnabled", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "discordWebhookUrl", "id", "incidentBanner", "lastRadarrSync", "lastSonarrSync", "notificationMatrix", "plexMachineId", "requestsEnabled", "resendApiKey", "resendFromEmail", "resendToEmail", "siteName", "supportEnabled", "syncIntervalHours", "telegramBotToken", "telegramChatId", "updatedAt") SELECT "autoApproveRequests", "calendarEnabled", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "discordWebhookUrl", "id", "incidentBanner", "lastRadarrSync", "lastSonarrSync", "notificationMatrix", "plexMachineId", "requestsEnabled", "resendApiKey", "resendFromEmail", "resendToEmail", "siteName", "supportEnabled", "syncIntervalHours", "telegramBotToken", "telegramChatId", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "authProvider" TEXT NOT NULL DEFAULT 'plex',
    "displayName" TEXT,
    "passwordHash" TEXT,
    "plexId" INTEGER,
    "plexToken" TEXT,
    "plexUsername" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "hasPlexServerAccess" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatar", "createdAt", "email", "hasPlexServerAccess", "id", "plexId", "plexToken", "plexUsername", "role", "updatedAt") SELECT "avatar", "createdAt", "email", "hasPlexServerAccess", "id", "plexId", "plexToken", "plexUsername", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_plexId_key" ON "User"("plexId");

-- Backfill displayName from plexUsername or email
UPDATE "User" SET "displayName" = COALESCE("plexUsername", "email") WHERE "displayName" IS NULL;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
