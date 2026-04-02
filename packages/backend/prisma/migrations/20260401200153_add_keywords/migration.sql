-- AlterTable
ALTER TABLE "Media" ADD COLUMN "keywordIds" TEXT;

-- CreateTable
CREATE TABLE "Keyword" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tmdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_tmdbId_key" ON "Keyword"("tmdbId");
