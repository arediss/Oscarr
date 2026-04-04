-- Fix any remaining rules with mediaType 'all' (no longer supported)
UPDATE "FolderRule" SET "mediaType" = 'tv' WHERE "mediaType" = 'all';
