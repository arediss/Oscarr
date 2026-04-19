import { initScheduler } from '../services/scheduler.js';
import { initNotifications as initNotificationsInternal } from '../notifications/index.js';
import { pluginEngine } from '../plugins/engine.js';

/** Initialize core notification providers before plugins load so plugin providers can extend
 *  the registry rather than race it. */
export function initNotifications() {
  initNotificationsInternal();
}

/** Start CRON scheduler after the HTTP server is listening so a misbehaving job can't block
 *  the listen call. Passes the plugin engine so plugin-contributed jobs get scheduled too. */
export async function startScheduler() {
  await initScheduler(pluginEngine);
}
