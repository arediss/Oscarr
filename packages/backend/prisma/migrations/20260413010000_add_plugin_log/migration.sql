-- CreateTable
CREATE TABLE "PluginLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pluginId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PluginLog_pluginId_createdAt_idx" ON "PluginLog"("pluginId", "createdAt");
