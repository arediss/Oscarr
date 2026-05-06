-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PluginState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pluginId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "onInstallRan" BOOLEAN NOT NULL DEFAULT false,
    "latestVersion" TEXT,
    "lastUpdateCheck" DATETIME,
    "installSource" TEXT NOT NULL DEFAULT 'local',
    "autoUpdateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdateAttemptAt" DATETIME,
    "lastUpdateStatus" TEXT,
    "lastUpdateError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PluginState" ("createdAt", "enabled", "id", "installSource", "lastUpdateCheck", "latestVersion", "onInstallRan", "pluginId", "settings", "updatedAt") SELECT "createdAt", "enabled", "id", "installSource", "lastUpdateCheck", "latestVersion", "onInstallRan", "pluginId", "settings", "updatedAt" FROM "PluginState";
DROP TABLE "PluginState";
ALTER TABLE "new_PluginState" RENAME TO "PluginState";
CREATE UNIQUE INDEX "PluginState_pluginId_key" ON "PluginState"("pluginId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
