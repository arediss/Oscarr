// Barrel re-export — the implementation now lives in sync/*.ts
export { syncArrService } from './sync/mediaSync.js';
export { syncAvailabilityDates } from './sync/availabilitySync.js';
export { runNewMediaSync, runFullSync } from './sync/index.js';
export type { SyncResult } from './sync/helpers.js';
