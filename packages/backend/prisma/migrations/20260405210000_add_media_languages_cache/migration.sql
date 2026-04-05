-- Add cached audio/subtitle languages to Media
ALTER TABLE "Media" ADD COLUMN "audioLanguages" TEXT;
ALTER TABLE "Media" ADD COLUMN "subtitleLanguages" TEXT;
