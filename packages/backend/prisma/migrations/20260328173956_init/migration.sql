-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserProvider" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT,
    "providerToken" TEXT,
    "providerUsername" TEXT,
    "providerEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Media" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tmdbId" INTEGER NOT NULL,
    "tvdbId" INTEGER,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "overview" TEXT,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "releaseDate" TEXT,
    "voteAverage" REAL,
    "genres" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "radarrId" INTEGER,
    "sonarrId" INTEGER,
    "qualityProfileId" INTEGER,
    "availableAt" DATETIME,
    "lastMissingSearchAt" DATETIME,
    "lastEpisodeInfo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Season" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaId" INTEGER NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "episodeCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    CONSTRAINT "Season_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mediaType" TEXT NOT NULL,
    "seasons" TEXT,
    "rootFolder" TEXT,
    "qualityOptionId" INTEGER,
    "approvedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaRequest_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MediaRequest_qualityOptionId_fkey" FOREIGN KEY ("qualityOptionId") REFERENCES "QualityOption" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSettings" (
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
    "missingSearchCooldownMin" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CronJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL DEFAULT '0 */6 * * *',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "lastDuration" INTEGER,
    "lastResult" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Service" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FolderRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "mediaType" TEXT NOT NULL,
    "conditions" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "seriesType" TEXT,
    "serviceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FolderRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityOption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QualityMapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "qualityOptionId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "qualityProfileId" INTEGER NOT NULL,
    "qualityProfileName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityMapping_qualityOptionId_fkey" FOREIGN KEY ("qualityOptionId") REFERENCES "QualityOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityMapping_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "level" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TmdbCache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cacheKey" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PluginState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pluginId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserProvider_userId_idx" ON "UserProvider"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProvider_provider_providerId_key" ON "UserProvider"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProvider_userId_provider_key" ON "UserProvider"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Media_tmdbId_mediaType_key" ON "Media"("tmdbId", "mediaType");

-- CreateIndex
CREATE UNIQUE INDEX "Season_mediaId_seasonNumber_key" ON "Season"("mediaId", "seasonNumber");

-- CreateIndex
CREATE INDEX "MediaRequest_userId_idx" ON "MediaRequest"("userId");

-- CreateIndex
CREATE INDEX "MediaRequest_mediaId_idx" ON "MediaRequest"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "CronJob_key_key" ON "CronJob"("key");

-- CreateIndex
CREATE UNIQUE INDEX "QualityOption_label_key" ON "QualityOption"("label");

-- CreateIndex
CREATE UNIQUE INDEX "QualityMapping_qualityOptionId_serviceId_qualityProfileId_key" ON "QualityMapping"("qualityOptionId", "serviceId", "qualityProfileId");

-- CreateIndex
CREATE INDEX "AppLog_label_idx" ON "AppLog"("label");

-- CreateIndex
CREATE INDEX "AppLog_createdAt_idx" ON "AppLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TmdbCache_cacheKey_key" ON "TmdbCache"("cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "PluginState_pluginId_key" ON "PluginState"("pluginId");

-- CreateIndex
CREATE INDEX "UserNotification_userId_read_idx" ON "UserNotification"("userId", "read");

-- CreateIndex
CREATE INDEX "UserNotification_createdAt_idx" ON "UserNotification"("createdAt");
