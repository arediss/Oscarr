-- Recreated 2026-05-05 to fix drift: this migration was applied to the DB on 2026-04-25
-- but the file was missing from the repo. Restored to match the existing DB schema so
-- Prisma can move forward cleanly.
ALTER TABLE "PluginState" ADD COLUMN "installSource" TEXT NOT NULL DEFAULT 'local';
