import { join } from 'path';
import { readFile, rm } from 'fs/promises';
import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { notificationRegistry } from '../notifications/index.js';
import { discoverPlugins } from './loader.js';
import { parseManifest } from './manifestSchema.js';
import { checkCompat, type CompatResult } from './compat.js';
import { updateJobSchedule } from '../services/scheduler.js';
import { createContext, type ContextFactoryDeps } from './context/index.js';
import type {
  LoadedPlugin,
  LoadedUIContribution,
  PluginGuardResult,
  PluginInfo,
  PluginManifest,
  PluginRegistration,
} from './types.js';

export class PluginEngine {
  private plugins = new Map<string, LoadedPlugin>();
  private settingsCache = new Map<string, Record<string, unknown>>();
  private compatCache = new Map<string, CompatResult>();
  /** Plugin IDs that the admin has uninstalled during this process lifetime. Their routes are
   *  still registered with Fastify (no dynamic unregister) but the guard below returns 404. */
  private uninstalled = new Set<string>();
  /** Plugin IDs whose routes have been registered with the live Fastify app. Used to avoid
   *  double-registering (Fastify throws on duplicate prefix) when togglePlugin(true) is called
   *  on a plugin that already registered its routes at boot or hot-load. */
  private routesRegistered = new Set<string>();
  private logger: FastifyBaseLogger | null = null;
  private app: FastifyInstance | null = null;

  /** Call once after Fastify is ready to provide a structured logger. */
  setLogger(logger: FastifyBaseLogger): void {
    this.logger = logger;
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', msg: string): void {
    if (this.logger) {
      this.logger[level](msg);
    } else {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn('[PluginEngine]', String(msg));
    }
  }

  /**
   * Shared "load one plugin from disk" pipeline used by both loadAll (boot) and loadSingle (runtime install).
   * Runs the compat check, upserts PluginState, dynamic-imports the entry, calls register(), runs onInstall
   * if first-time, registers notification providers, and stores the LoadedPlugin in the map. Does NOT
   * register Fastify routes — callers handle that themselves (boot path uses registerWithFastify, runtime
   * install uses inline app.register). Throws on compat failure or register() error.
   */
  private async _loadFromDisk(
    dir: string,
    manifest: PluginManifest,
    opts: { defaultEnabled: boolean }
  ): Promise<LoadedPlugin> {
    const compat = checkCompat(manifest);
    this.compatCache.set(manifest.id, compat);
    if (compat.status === 'incompatible') {
      throw new Error(`Plugin "${manifest.id}" is incompatible: ${compat.reason}`);
    }

    const state = await prisma.pluginState.upsert({
      where: { pluginId: manifest.id },
      update: {},
      create: { pluginId: manifest.id, enabled: opts.defaultEnabled, settings: '{}' },
    });

    const entryPath = join(dir, manifest.entry);
    const mod = await import(entryPath);
    if (typeof mod.register !== 'function') {
      throw new Error(`Plugin "${manifest.id}" does not export a register() function`);
    }

    const ctx = createContext(manifest, this.getContextDeps());
    const registration: PluginRegistration = await mod.register(ctx);

    if (!state.onInstallRan && registration.onInstall) {
      await registration.onInstall(ctx);
      await prisma.pluginState.update({
        where: { pluginId: manifest.id },
        data: { onInstallRan: true },
      });
      this.log('info', `Ran onInstall for "${manifest.id}"`);
    }

    if (registration.registerNotificationProviders) {
      registration.registerNotificationProviders(notificationRegistry);
    }

    const loaded: LoadedPlugin = { manifest, registration, dir, enabled: state.enabled };
    this.plugins.set(manifest.id, loaded);
    return loaded;
  }

  /** Register a plugin's routes against the live Fastify app with the uninstall guard. Used by both
   *  loadSingle (hot-load) and registerWithFastify (boot). */
  private async _registerRoutes(plugin: LoadedPlugin): Promise<void> {
    if (!this.app || !plugin.registration.registerRoutes) return;
    const { manifest, registration } = plugin;
    const prefix = manifest.hooks?.routes?.prefix || `/api/plugins/${manifest.id}`;
    const pluginId = manifest.id;
    const engine = this;
    try {
      const ctx = createContext(manifest, this.getContextDeps());
      await this.app.register(
        async (instance) => {
          // Uninstall guard — Fastify has no route unregister, so we short-circuit here instead.
          instance.addHook('preHandler', async (_req, reply) => {
            if (engine.uninstalled.has(pluginId)) {
              return reply.status(404).send({ error: 'Plugin has been uninstalled' });
            }
          });
          await registration.registerRoutes!(instance, ctx);
        },
        { prefix }
      );
      this.routesRegistered.add(manifest.id);
      this.log('info', `Registered routes for "${manifest.id}" at ${prefix}`);
    } catch (err) {
      this.log('error', `Route registration failed for "${manifest.id}": ${err}`);
      plugin.error = `Route registration failed: ${err}`;
      plugin.enabled = false;
      await prisma.pluginState.update({
        where: { pluginId: manifest.id },
        data: { enabled: false },
      }).catch(() => {});
    }
  }

  /**
   * Load a single plugin from its directory at runtime. Used by the install flow to avoid a full restart.
   *
   * `defaultEnabled` controls the state when the plugin has never been seen before:
   *  - `true` (boot-time discovery) — preserves the current UX where filesystem-present plugins load enabled
   *  - `false` (runtime install) — gives the admin a chance to review capabilities before enabling
   */
  async loadSingle(dir: string, opts: { defaultEnabled?: boolean } = {}): Promise<LoadedPlugin> {
    const raw = await readFile(join(dir, 'manifest.json'), 'utf-8');
    const manifest = parseManifest(JSON.parse(raw), dir) as PluginManifest;

    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already loaded`);
    }

    const loaded = await this._loadFromDisk(dir, manifest, { defaultEnabled: opts.defaultEnabled ?? true });
    if (loaded.enabled) await this._registerRoutes(loaded);
    this.log('info', `Loaded "${manifest.id}" v${manifest.version} via loadSingle`);
    return loaded;
  }

  async loadAll(): Promise<void> {
    const discovered = await discoverPlugins();
    this.log('info', `Discovered ${discovered.length} plugin(s)`);

    for (const { dir, manifest } of discovered) {
      try {
        await this._loadFromDisk(dir, manifest, { defaultEnabled: true });
        this.log('info', `Loaded "${manifest.id}" v${manifest.version}`);
      } catch (err) {
        this.log('error', `Failed to load plugin "${manifest.id}": ${err}`);
        this.plugins.set(manifest.id, {
          manifest,
          registration: { manifest } as PluginRegistration,
          dir,
          enabled: false,
          error: String(err),
        });
      }
    }
  }

  async registerWithFastify(app: FastifyInstance): Promise<void> {
    this.setLogger(app.log);
    this.app = app;

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || plugin.error) continue;
      if (!plugin.registration.registerRoutes) continue;
      await this._registerRoutes(plugin);
    }
  }

  getJobHandlers(): Record<string, () => Promise<unknown>> {
    const handlers: Record<string, () => Promise<unknown>> = {};
    for (const [id, plugin] of this.plugins) {
      if (!plugin.enabled || plugin.error || !plugin.registration.registerJobs) continue;
      try {
        const ctx = createContext(plugin.manifest, this.getContextDeps());
        const jobs = plugin.registration.registerJobs(ctx);
        for (const [key, handler] of Object.entries(jobs)) {
          handlers[key] = handler;
        }
      } catch (err) {
        this.log('error', `Failed to get job handlers for "${id}": ${err}`);
      }
    }
    return handlers;
  }

  getJobDefs(): { key: string; label: string; cron: string }[] {
    const defs: { key: string; label: string; cron: string }[] = [];
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || plugin.error) continue;
      for (const job of plugin.manifest.hooks?.jobs || []) {
        defs.push(job);
      }
    }
    return defs;
  }

  getUIContributions(hookPoint: string): LoadedUIContribution[] {
    const contributions: LoadedUIContribution[] = [];
    for (const [id, plugin] of this.plugins) {
      if (!plugin.enabled || plugin.error) continue;
      for (const ui of plugin.manifest.hooks?.ui || []) {
        if (ui.hookPoint === hookPoint) {
          contributions.push({ ...ui, pluginId: id });
        }
      }
    }
    return contributions.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  getAllFeatureFlags(): Record<string, boolean> {
    const flags: Record<string, boolean> = {};
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || plugin.error) continue;
      Object.assign(flags, plugin.manifest.hooks?.features || {});
    }
    return flags;
  }

  getPluginList(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      author: p.manifest.author,
      enabled: p.enabled,
      hasSettings: (p.manifest.settings?.length ?? 0) > 0,
      hasFrontend: !!p.manifest.frontend,
      error: p.error,
      compat: this.compatCache.get(p.manifest.id),
    }));
  }

  getPlugin(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Uninstall a plugin: mark its routes as 404 via the runtime guard, pause its jobs, remove its
   * dir from disk. Does not attempt to unregister Fastify routes (not supported) — admin restart
   * is required to free the in-memory handlers. Returns true if the plugin was known and removed.
   */
  async uninstall(id: string): Promise<boolean> {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;

    // Pause jobs before the dir disappears so a cron tick doesn't try to import a removed file.
    for (const job of plugin.manifest.hooks?.jobs ?? []) {
      try {
        const dbJob = await prisma.cronJob.findUnique({ where: { key: job.key } });
        if (dbJob) await updateJobSchedule(job.key, dbJob.cronExpression, false);
      } catch (err) {
        this.log('warn', `Failed to pause job "${job.key}" during uninstall of "${id}": ${err}`);
      }
    }

    // Flip the runtime guard BEFORE deleting the dir so no in-flight request imports a removed file.
    this.uninstalled.add(id);
    plugin.enabled = false;
    plugin.error = 'Uninstalled — restart Oscarr to release the in-memory routes';

    await prisma.pluginState.update({ where: { pluginId: id }, data: { enabled: false } }).catch(() => {});

    await rm(plugin.dir, { recursive: true, force: true }).catch((err) => {
      this.log('error', `Failed to delete plugin dir "${plugin.dir}": ${err}`);
    });

    this.settingsCache.delete(id);
    this.log('info', `Uninstalled "${id}" — routes will 404 until restart`);
    return true;
  }

  async togglePlugin(id: string, enabled: boolean): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin "${id}" not found`);

    // Call lifecycle hook before persisting (best-effort, don't block toggle)
    try {
      if (enabled && plugin.registration.onEnable) {
        const ctx = createContext(plugin.manifest, this.getContextDeps());
        await plugin.registration.onEnable(ctx);
      } else if (!enabled && plugin.registration.onDisable) {
        const ctx = createContext(plugin.manifest, this.getContextDeps());
        await plugin.registration.onDisable(ctx);
      }
    } catch (err) {
      this.log('error', `Lifecycle hook ${enabled ? 'onEnable' : 'onDisable'} failed for "${id}": ${err}`);
    }

    await prisma.pluginState.update({
      where: { pluginId: id },
      data: { enabled },
    });
    plugin.enabled = enabled;
    this.settingsCache.delete(id);

    // If the plugin was loaded disabled (consent flow after /install) its routes were skipped.
    // When the admin now toggles it ON for the first time, mount the routes on the live app.
    if (enabled && !this.routesRegistered.has(id) && plugin.registration.registerRoutes) {
      await this._registerRoutes(plugin);
    }

    // Stop or restart plugin cron jobs
    const jobDefs = plugin.manifest.hooks?.jobs || [];
    for (const job of jobDefs) {
      try {
        const dbJob = await prisma.cronJob.findUnique({ where: { key: job.key } });
        if (dbJob) {
          await updateJobSchedule(job.key, dbJob.cronExpression, enabled && dbJob.enabled);
          this.log('info', `${enabled ? 'Resumed' : 'Stopped'} job "${job.key}" for plugin "${id}"`);
        }
      } catch (err) {
        this.log('error', `Failed to ${enabled ? 'resume' : 'stop'} job "${job.key}" for plugin "${id}": ${err}`);
      }
    }
  }

  async getSettings(id: string): Promise<{ schema: PluginManifest['settings']; values: Record<string, unknown> }> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin "${id}" not found`);

    const values = await this.getCachedSettings(id);
    return { schema: plugin.manifest.settings || [], values };
  }

  async updateSettings(id: string, values: Record<string, unknown>): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin "${id}" not found`);

    const validationError = this.validateSettings(plugin.manifest, values);
    if (validationError) throw new Error(validationError);

    await prisma.pluginState.update({
      where: { pluginId: id },
      data: { settings: JSON.stringify(values) },
    });
    this.settingsCache.set(id, values);
  }

  async runGuards(guardName: string, userId: number): Promise<PluginGuardResult | null> {
    for (const [id, plugin] of this.plugins) {
      if (!plugin.enabled || plugin.error || !plugin.registration.registerGuards) continue;
      try {
        const ctx = createContext(plugin.manifest, this.getContextDeps());
        const guards = plugin.registration.registerGuards(ctx);
        const guard = guards[guardName];
        if (!guard) continue;
        const result = await guard(userId);
        if (result?.blocked) return result;
      } catch (err) {
        this.log('error', `Guard "${guardName}" failed for plugin "${id}": ${err}`);
      }
    }
    return null;
  }

  // ── Private helpers ───────────────────────────────────────────────

  private validateSettings(manifest: PluginManifest, values: Record<string, unknown>): string | null {
    const schema = manifest.settings || [];
    for (const field of schema) {
      const val = values[field.key];

      if (field.required && (val === undefined || val === null || val === '')) {
        return `Setting "${field.label}" is required`;
      }

      if (val === undefined || val === null || val === '') continue;

      switch (field.type) {
        case 'number':
          if (typeof val !== 'number' || isNaN(val)) return `Setting "${field.label}" must be a number`;
          break;
        case 'boolean':
          if (typeof val !== 'boolean') return `Setting "${field.label}" must be a boolean`;
          break;
        case 'string':
        case 'password':
          if (typeof val !== 'string') return `Setting "${field.label}" must be a string`;
          break;
      }
    }
    return null;
  }

  private async getCachedSettings(pluginId: string): Promise<Record<string, unknown>> {
    const cached = this.settingsCache.get(pluginId);
    if (cached) return cached;

    const state = await prisma.pluginState.findUnique({ where: { pluginId } });
    const values = state ? JSON.parse(state.settings) : {};
    this.settingsCache.set(pluginId, values);
    return values;
  }

  private getContextDeps(): ContextFactoryDeps {
    return {
      logger: this.logger,
      getCachedSettings: (pluginId: string) => this.getCachedSettings(pluginId),
      setSettingsCache: (pluginId: string, values: Record<string, unknown>) => {
        this.settingsCache.set(pluginId, values);
      },
      makeFallbackLogger: (pluginId: string) => this.makeFallbackLogger(pluginId),
      signAuthToken: (payload) => {
        if (!this.app) throw new Error('Plugin engine not yet registered with Fastify — cannot issue auth tokens');
        return this.app.jwt.sign(payload, { expiresIn: '24h' });
      },
    };
  }

  private makeFallbackLogger(pluginId: string): FastifyBaseLogger {
    const prefix = `[Plugin:${pluginId}]`;
    const log = Object.assign((...args: unknown[]) => console.log(prefix, ...args), {
      info: (...args: unknown[]) => console.info(prefix, ...args),
      warn: (...args: unknown[]) => console.warn(prefix, ...args),
      error: (...args: unknown[]) => console.error(prefix, ...args),
      debug: (...args: unknown[]) => console.debug(prefix, ...args),
      fatal: (...args: unknown[]) => console.error(`${prefix}[FATAL]`, ...args),
      trace: (...args: unknown[]) => console.debug(`${prefix}[TRACE]`, ...args),
      silent: () => {},
      child: () => log,
      level: 'info',
    });
    return log as unknown as FastifyBaseLogger;
  }
}

export const pluginEngine = new PluginEngine();
