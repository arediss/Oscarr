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
    "setupChecklistDismissed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("apiKey", "autoApproveRequests", "calendarEnabled", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "disabledLoginMode", "homepageLayout", "id", "incidentBanner", "instanceLanguages", "lastRadarrSync", "lastSonarrSync", "missingSearchCooldownMin", "notificationMatrix", "nsfwBlurEnabled", "plexMachineId", "registrationEnabled", "requestsEnabled", "siteName", "siteUrl", "supportEnabled", "syncIntervalHours", "updatedAt") SELECT "apiKey", "autoApproveRequests", "calendarEnabled", "defaultAnimeFolder", "defaultMovieFolder", "defaultQualityProfile", "defaultTvFolder", "disabledLoginMode", "homepageLayout", "id", "incidentBanner", "instanceLanguages", "lastRadarrSync", "lastSonarrSync", "missingSearchCooldownMin", "notificationMatrix", "nsfwBlurEnabled", "plexMachineId", "registrationEnabled", "requestsEnabled", "siteName", "siteUrl", "supportEnabled", "syncIntervalHours", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
