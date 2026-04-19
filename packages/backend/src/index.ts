import './env.js';
import Fastify from 'fastify';
import { loadInstallState } from './utils/install.js';
import { registerSecurity } from './bootstrap/security.js';
import { registerDocs } from './bootstrap/docs.js';
import { registerRoutes } from './bootstrap/routes.js';
import { registerPlugins } from './bootstrap/plugins.js';
import { registerStatic } from './bootstrap/static.js';
import { initNotifications, startScheduler } from './bootstrap/jobs.js';

// Trust X-Forwarded-* headers (client IP, scheme) when running behind a reverse proxy — the
// default because Docker / Traefik / nginx / Caddy are the overwhelming deploy path. Set
// TRUST_PROXY=false only when exposing Oscarr directly to the network (no proxy in front),
// otherwise any client can spoof their IP by sending X-Forwarded-For themselves.
const trustProxy = process.env.TRUST_PROXY !== 'false';
const app = Fastify({ logger: true, trustProxy });

async function start() {
  loadInstallState();
  await registerSecurity(app);
  await registerDocs(app); // before routes so the onRoute hook tags everything
  await registerRoutes(app);
  initNotifications();     // before plugins so providers can extend the registry
  await registerPlugins(app);
  await registerStatic(app);

  const port = parseInt(process.env.PORT || '3001', 10);
  if (Number.isNaN(port)) throw new Error('PORT environment variable must be a valid number');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Oscarr API running on port ${port}`);

  await startScheduler();
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

export type App = typeof app;
