/*
  Warnings:

  - You are about to drop the column `discordWebhookUrl` on the `AppSettings` table. All the data in the column will be lost.
  - You are about to drop the column `resendApiKey` on the `AppSettings` table. All the data in the column will be lost.
  - You are about to drop the column `resendFromEmail` on the `AppSettings` table. All the data in the column will be lost.
  - You are about to drop the column `resendToEmail` on the `AppSettings` table. All the data in the column will be lost.
  - You are about to drop the column `telegramBotToken` on the `AppSettings` table. All the data in the column will be lost.
  - You are about to drop the column `telegramChatId` on the `AppSettings` table. All the data in the column will be lost.

*/

-- Migrate existing notification credentials to new table

-- Create the new table first
CREATE TABLE "NotificationProviderConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "providerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Create unique index
CREATE UNIQUE INDEX "NotificationProviderConfig_providerId_key" ON "NotificationProviderConfig"("providerId");

-- Migrate Discord credentials
INSERT INTO "NotificationProviderConfig" ("providerId", "enabled", "settings", "createdAt", "updatedAt")
SELECT
  'discord',
  CASE WHEN "discordWebhookUrl" IS NOT NULL AND "discordWebhookUrl" != '' THEN 1 ELSE 0 END,
  '{"webhookUrl":"' || COALESCE(REPLACE("discordWebhookUrl", '"', '\"'), '') || '"}',
  datetime('now'),
  datetime('now')
FROM "AppSettings" WHERE "id" = 1 AND "discordWebhookUrl" IS NOT NULL AND "discordWebhookUrl" != '';

-- Migrate Telegram credentials
INSERT INTO "NotificationProviderConfig" ("providerId", "enabled", "settings", "createdAt", "updatedAt")
SELECT
  'telegram',
  CASE WHEN "telegramBotToken" IS NOT NULL AND "telegramBotToken" != '' AND "telegramChatId" IS NOT NULL AND "telegramChatId" != '' THEN 1 ELSE 0 END,
  '{"botToken":"' || COALESCE(REPLACE("telegramBotToken", '"', '\"'), '') || '","chatId":"' || COALESCE(REPLACE("telegramChatId", '"', '\"'), '') || '"}',
  datetime('now'),
  datetime('now')
FROM "AppSettings" WHERE "id" = 1 AND "telegramBotToken" IS NOT NULL AND "telegramBotToken" != '';

-- Migrate Email (Resend) credentials
INSERT INTO "NotificationProviderConfig" ("providerId", "enabled", "settings", "createdAt", "updatedAt")
SELECT
  'email',
  CASE WHEN "resendApiKey" IS NOT NULL AND "resendApiKey" != '' THEN 1 ELSE 0 END,
  '{"apiKey":"' || COALESCE(REPLACE("resendApiKey", '"', '\"'), '') || '","fromEmail":"' || COALESCE(REPLACE("resendFromEmail", '"', '\"'), '') || '","toEmail":"' || COALESCE(REPLACE("resendToEmail", '"', '\"'), '') || '"}',
  datetime('now'),
  datetime('now')
FROM "AppSettings" WHERE "id" = 1 AND "resendApiKey" IS NOT NULL AND "resendApiKey" != '';

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
    "notificationMatrix" TEXT,
    "incidentBanner" TEXT,
    "autoApproveRequests" BOOLEAN NOT NULL DEFAULT false,
    "requestsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supportEnabled" BOOLEAN NOT NULL DEFAULT true,
    "calendarEnabled" BOOLEAN NOT NULL DEFAULT true,
    "siteName" TEXT NOT NULL DEFAULT 'Oscarr',
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "missingSearchCooldownMin" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("autoApproveRequests", "calendarEnabled", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "id", "incidentBanner", "lastRadarrSync", "lastSonarrSync", "missingSearchCooldownMin", "notificationMatrix", "plexMachineId", "registrationEnabled", "requestsEnabled", "siteName", "supportEnabled", "syncIntervalHours", "updatedAt") SELECT "autoApproveRequests", "calendarEnabled", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "id", "incidentBanner", "lastRadarrSync", "lastSonarrSync", "missingSearchCooldownMin", "notificationMatrix", "plexMachineId", "registrationEnabled", "requestsEnabled", "siteName", "supportEnabled", "syncIntervalHours", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
