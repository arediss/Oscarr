-- Fix anime rule: mediaType 'all' is invalid, anime are TV series only
UPDATE "FolderRule" SET "mediaType" = 'tv' WHERE "name" = 'Animes' AND "mediaType" = 'all';
