-- CreateIndex
CREATE INDEX "Media_status_idx" ON "Media"("status");

-- CreateIndex
CREATE INDEX "Media_availableAt_idx" ON "Media"("availableAt");

-- CreateIndex
CREATE INDEX "Media_radarrId_idx" ON "Media"("radarrId");

-- CreateIndex
CREATE INDEX "Media_sonarrId_idx" ON "Media"("sonarrId");

-- CreateIndex
CREATE INDEX "Media_contentRating_idx" ON "Media"("contentRating");

-- CreateIndex
CREATE INDEX "Media_status_availableAt_idx" ON "Media"("status", "availableAt");

-- CreateIndex
CREATE INDEX "MediaRequest_status_idx" ON "MediaRequest"("status");
