-- CreateTable
CREATE TABLE "Role" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- Seed default roles
INSERT INTO "Role" ("name", "permissions", "isDefault", "isSystem", "position", "updatedAt")
VALUES (
    'admin',
    '["*"]',
    false,
    true,
    0,
    CURRENT_TIMESTAMP
);

INSERT INTO "Role" ("name", "permissions", "isDefault", "isSystem", "position", "updatedAt")
VALUES (
    'user',
    '["$authenticated","requests.read","requests.create","requests.delete","support.read","support.create","support.write"]',
    true,
    true,
    1,
    CURRENT_TIMESTAMP
);
