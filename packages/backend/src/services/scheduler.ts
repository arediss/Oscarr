import cron, { type ScheduledTask } from 'node-cron';
import { prisma } from '../utils/prisma.js';
import { runFullSync, runNewMediaSync } from './sync.js';
import { syncRequestsFromTags, cleanupOrphanedRequests } from './requestSync.js';
import { getGenreBackdrops } from './tmdb.js';
import { syncMissingKeywords } from './keywordSync.js';
import type { PluginEngine } from '../plugins/engine.js';
import { logEvent } from '../utils/logEvent.js';

/** Strip control characters (newlines, tabs, etc.) to prevent log injection */
function sanitize(input: string): string {
  return input.replace(/[\r\n\t]/g, '');
}

// Map of job keys to their handler functions
const JOB_HANDLERS: Record<string, () => Promise<unknown>> = {
  new_media_sync: async () => runNewMediaSync(),
  full_sync: async () => runFullSync(),
  request_sync: async () => syncRequestsFromTags(),
  cleanup_orphans: async () => cleanupOrphanedRequests(),
  genre_backdrops_refresh: async () => getGenreBackdrops(),
  keyword_sync: async () => syncMissingKeywords(),
};

// Default job definitions (seeded on first boot)
const DEFAULT_JOBS = [
  { key: 'new_media_sync', label: 'Sync new media', cronExpression: '*/15 * * * *', enabled: true },
  { key: 'full_sync', label: 'Full sync (Radarr + Sonarr)', cronExpression: '0 6 * * *', enabled: true },
  { key: 'request_sync', label: 'Sync requests', cronExpression: '*/5 * * * *', enabled: true },
  { key: 'cleanup_orphans', label: 'Cleanup orphaned requests', cronExpression: '0 3 * * *', enabled: true },
  { key: 'genre_backdrops_refresh', label: 'Refresh genre backdrops', cronExpression: '0 4 * * *', enabled: true },
  { key: 'keyword_sync', label: 'Sync TMDB keywords', cronExpression: '0 */1 * * *', enabled: true },
];

const activeTasks = new Map<string, ScheduledTask>();

async function seedJobs() {
  for (const job of DEFAULT_JOBS) {
    await prisma.cronJob.upsert({
      where: { key: job.key },
      update: {},
      create: job,
    });
  }
}

async function runJob(key: string) {
  const handler = JOB_HANDLERS[key];
  if (!handler) return;

  const wasFirstSync = !(await hasCompletedFirstSync());

  const start = Date.now();
  try {
    const result = await handler();
    const duration = Date.now() - start;
    await prisma.cronJob.update({
      where: { key },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'success',
        lastDuration: duration,
        lastResult: JSON.stringify(result ?? null),
      },
    });
    console.log(`[Scheduler] Job "${sanitize(key)}" completed in ${duration}ms`);
    logEvent('info', 'Job', `Job "${sanitize(key)}" terminé en ${duration}ms`);

    // After the first successful full sync, start all cron schedules
    if (wasFirstSync && key === 'full_sync' && activeTasks.size === 0) {
      console.log('[Scheduler] First full sync done — starting cron schedules');
      await startAllJobs();
    }

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    await prisma.cronJob.update({
      where: { key },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'error',
        lastDuration: duration,
        lastResult: JSON.stringify({ error: String(err) }),
      },
    });
    console.error(`[Scheduler] Job "${sanitize(key)}" failed:`, err);
    logEvent('error', 'Job', `Job "${sanitize(key)}" échoué : ${err}`);
    throw err;
  }
}

function scheduleJob(key: string, cronExpression: string) {
  // Stop existing task if any
  const existing = activeTasks.get(key);
  if (existing) {
    existing.stop();
    activeTasks.delete(key);
  }

  if (!cron.validate(cronExpression)) {
    console.error(`[Scheduler] Invalid cron expression for "${sanitize(key)}": ${sanitize(cronExpression)}`);
    return;
  }

  const task = cron.schedule(cronExpression, () => {
    runJob(key).catch(() => {});
  });
  activeTasks.set(key, task);
  console.log(`[Scheduler] Job "${sanitize(key)}" scheduled: ${sanitize(cronExpression)}`);
}

/** Check if a first full sync has been completed */
async function hasCompletedFirstSync(): Promise<boolean> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  return !!(settings?.lastRadarrSync || settings?.lastSonarrSync);
}

/** Start all enabled cron schedules */
async function startAllJobs() {
  const jobs = await prisma.cronJob.findMany();
  for (const job of jobs) {
    if (job.enabled) {
      scheduleJob(job.key, job.cronExpression);
    }
  }
  console.log(`[Scheduler] ${jobs.filter((j) => j.enabled).length}/${jobs.length} jobs active`);
}

export async function initScheduler(pluginEngine?: PluginEngine) {
  // Register plugin job handlers and seed their definitions
  if (pluginEngine) {
    const pluginHandlers = pluginEngine.getJobHandlers();
    Object.assign(JOB_HANDLERS, pluginHandlers);

    const pluginJobDefs = pluginEngine.getJobDefs();
    for (const job of pluginJobDefs) {
      await prisma.cronJob.upsert({
        where: { key: job.key },
        update: {},
        create: { key: job.key, label: job.label, cronExpression: job.cron, enabled: true },
      });
    }
  }

  await seedJobs();

  // Only start cron schedules if a first full sync has been done
  if (await hasCompletedFirstSync()) {
    await startAllJobs();
  } else {
    console.log('[Scheduler] Jobs seeded but not started — waiting for first full sync');
  }
}

export async function updateJobSchedule(key: string, cronExpression: string, enabled: boolean) {
  const existing = activeTasks.get(key);
  if (existing) {
    existing.stop();
    activeTasks.delete(key);
  }

  if (enabled && cron.validate(cronExpression)) {
    scheduleJob(key, cronExpression);
  }
}

export async function triggerJob(key: string) {
  return runJob(key);
}

