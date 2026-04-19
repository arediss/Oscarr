import { initScheduler } from '../services/scheduler.js';
import { pluginEngine } from '../plugins/engine.js';

export { initNotifications } from '../notifications/index.js';

/** Start CRON scheduler after the HTTP server is listening so a misbehaving job can't block
 *  the listen call. Passes the plugin engine so plugin-contributed jobs get scheduled too. */
export async function startScheduler() {
  await initScheduler(pluginEngine);
}
