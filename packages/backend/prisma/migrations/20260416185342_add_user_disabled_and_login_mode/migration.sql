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
    "disabledLoginMode" TEXT NOT NULL DEFAULT 'friendly',
    "autoApproveRequests" BOOLEAN NOT NULL DEFAULT false,
    "requestsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supportEnabled" BOOLEAN NOT NULL DEFAULT true,
    "calendarEnabled" BOOLEAN NOT NULL DEFAULT true,
    "siteName" TEXT NOT NULL DEFAULT 'Oscarr',
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nsfwBlurEnabled" BOOLEAN NOT NULL DEFAULT true,
    "missingSearchCooldownMin" INTEGER NOT NULL DEFAULT 60,
    "instanceLanguages" TEXT NOT NULL DEFAULT '["en"]',
    "siteUrl" TEXT,
    "apiKey" TEXT,
    "homepageLayout" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("apiKey", "autoApproveRequests", "calendarEnabled", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "homepageLayout", "id", "incidentBanner", "instanceLanguages", "lastRadarrSync", "lastSonarrSync", "missingSearchCooldownMin", "notificationMatrix", "nsfwBlurEnabled", "plexMachineId", "registrationEnabled", "requestsEnabled", "siteName", "siteUrl", "supportEnabled", "syncIntervalHours", "updatedAt") SELECT "apiKey", "autoApproveRequests", "calendarEnabled", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "homepageLayout", "id", "incidentBanner", "instanceLanguages", "lastRadarrSync", "lastSonarrSync", "missingSearchCooldownMin", "notificationMatrix", "nsfwBlurEnabled", "plexMachineId", "registrationEnabled", "requestsEnabled", "siteName", "siteUrl", "supportEnabled", "syncIntervalHours", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatar", "createdAt", "displayName", "email", "id", "passwordHash", "role", "updatedAt") SELECT "avatar", "createdAt", "displayName", "email", "id", "passwordHash", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
