-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FolderRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "mediaType" TEXT NOT NULL,
    "conditions" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "seriesType" TEXT,
    "serviceId" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FolderRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FolderRule" ("conditions", "createdAt", "folderPath", "id", "mediaType", "name", "priority", "seriesType", "serviceId") SELECT "conditions", "createdAt", "folderPath", "id", "mediaType", "name", "priority", "seriesType", "serviceId" FROM "FolderRule";
DROP TABLE "FolderRule";
ALTER TABLE "new_FolderRule" RENAME TO "FolderRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
