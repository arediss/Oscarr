-- Seed TMDB keyword "anime" (ID 210024) with tag "anime"
INSERT OR IGNORE INTO "Keyword" ("tmdbId", "name", "tag", "createdAt", "updatedAt")
VALUES (210024, 'anime', 'anime', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Seed default anime routing rule: tag contains anime -> default anime folder
INSERT INTO "FolderRule" ("name", "priority", "mediaType", "conditions", "folderPath", "seriesType", "createdAt")
VALUES ('Animes', 0, 'all', '[{"field":"tag","operator":"contains","value":"anime"}]', '', 'anime', CURRENT_TIMESTAMP);
