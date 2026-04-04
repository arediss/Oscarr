-- Fix all rules: mediaType 'all' is invalid, a folder belongs to one service type
-- Default to 'tv' since Sonarr folders are more common for routing rules
UPDATE "FolderRule" SET "mediaType" = 'tv' WHERE "mediaType" = 'all';
