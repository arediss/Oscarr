-- Issue #167 — admin-defined custom links rendered in the user AccountModal.
-- JSON array of { id, label, url, icon, order } persisted alongside other AppSettings.

ALTER TABLE "AppSettings" ADD COLUMN "customLinks" TEXT NOT NULL DEFAULT '[]';
