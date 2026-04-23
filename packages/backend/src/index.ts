import './env.js';
import Fastify from 'fastify';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { prisma } from './utils/prisma.js';
import { loadInstallState } from './utils/install.js';
import { logEvent } from './utils/logEvent.js';
import { registerSecurity } from './bootstrap/security.js';
import { registerDocs } from './bootstrap/docs.js';
import { registerRoutes } from './bootstrap/routes.js';
import { registerPlugins } from './bootstrap/plugins.js';
import { registerStatic } from './bootstrap/static.js';
import { initNotifications, startScheduler } from './bootstrap/jobs.js';

// Process-level guards: log the error to AppLog (so an admin can share it from the Logs tab)
// then exit hard — a process that's already thrown an unhandled exception is in undefined state
// (half-open transactions, corrupted in-memory cache), and the supervisor (Docker/pm2) will
// respawn us cleanly. Keeping a zombie alive silently corrupts user data.
const exitAfterLog = (label: string, err: Error) => {
  logEvent('error', label, err.message, err)
    .catch((logErr) => console.error(`[${label}] logEvent failed`, logErr))
    .finally(() => process.exit(1));
};
process.on('uncaughtException', (err) => exitAfterLog('UncaughtException', err));
process.on('unhandledRejection', (reason) => {
  exitAfterLog('UnhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});

// Default on — set TRUST_PROXY=false only when exposed directly (no reverse proxy).
const trustProxy = process.env.TRUST_PROXY !== 'false';
const app = Fastify({
  logger: {
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        '*.password',
        '*.apiKey',
        '*.apikey',
        '*.token',
        '*.clientSecret',
        '*.client_secret',
        '*.refreshToken',
        '*.accessToken',
      ],
      censor: '[REDACTED]',
    },
  },
  trustProxy,
});

/** Always apply pending Prisma migrations at boot. Idempotent — zero-ops when the DB is
 *  already current, skips the noise, and catches both fresh installs and schema drift after
 *  `git pull`. */
async function ensureMigrated() {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: resolve(import.meta.dirname, '..'),
    stdio: 'inherit',
  });
  await prisma.$disconnect();
}

async function start() {
  loadInstallState();
  await ensureMigrated();
  await registerSecurity(app);
  await registerDocs(app);
  await registerRoutes(app);
  initNotifications();
  await registerPlugins(app);
  await registerStatic(app);

  const port = parseInt(process.env.PORT || '3001', 10);
  if (Number.isNaN(port)) throw new Error('PORT environment variable must be a valid number');
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info({ port }, 'Oscarr API listening');

  await startScheduler();
}

start().catch((err) => {
  app.log.fatal({ err }, 'Boot failed');
  process.exit(1);
});

export type App = typeof app;
