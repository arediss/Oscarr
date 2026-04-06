// Barrel re-export — the implementation now lives in sync/*.ts
export { syncRadarr } from './sync/movieSync.js';
export { syncSonarr } from './sync/tvSync.js';
export { syncAvailabilityDates } from './sync/availabilitySync.js';
export { runNewMediaSync, runFullSync } from './sync/index.js';
export type { SyncResult } from './sync/helpers.js';
