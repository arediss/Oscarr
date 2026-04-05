-- Reset all content ratings so they get recalculated with instance locale priority
-- Also reset keywordIds to force a full resync
UPDATE "Media" SET "contentRating" = NULL, "keywordIds" = NULL;
