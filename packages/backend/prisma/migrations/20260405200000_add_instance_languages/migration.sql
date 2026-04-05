-- Add instance languages configuration
ALTER TABLE "AppSettings" ADD COLUMN "instanceLanguages" TEXT NOT NULL DEFAULT '["en"]';
