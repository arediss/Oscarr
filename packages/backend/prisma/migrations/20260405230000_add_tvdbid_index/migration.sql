-- Add index on Media.tvdbId for faster lookups during sync, calendar, downloads
CREATE INDEX "Media_tvdbId_idx" ON "Media"("tvdbId");
