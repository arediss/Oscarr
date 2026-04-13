import { join } from 'path';
import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { notificationRegistry } from '../notifications/index.js';
import { discoverPlugins } from './loader.js';
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
  private logger: FastifyBaseLogger | null = null;

  /** Call once after Fastify is ready to provide a structured logger. */
  setLogger(logger: FastifyBaseLogger): void {
    this.logger = logger;
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', msg: string): void {
    if (this.logger) {
      this.logger[level](msg);
    } else {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn(`[PluginEngine] ${msg}`);
    }
  }

  async loadAll(): Promise<void> {
    const discovered = await discoverPlugins();
    this.log('info', `Discovered ${discovered.length} plugin(s)`);

    for (const { dir, manifest } of discovered) {
      try {
        const state = await prisma.pluginState.upsert({
          where: { pluginId: manifest.id },
          update: {},
          create: { pluginId: manifest.id, enabled: true, settings: '{}' },
        });

        const entryPath = join(dir, manifest.entry);
        const mod = await import(entryPath);

        if (typeof mod.register !== 'function') {
          throw new Error(`Plugin "${manifest.id}" does not export a register() function`);
        }

        const ctx = createContext(manifest, this.getContextDeps());
        const registration: PluginRegistration = await mod.register(ctx);

        // Run onInstall ONLY on first load (tracked by DB flag)
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
          this.log('info', `Registered notification providers for "${manifest.id}"`);
        }

        this.plugins.set(manifest.id, { manifest, registration, dir, enabled: state.enabled });
        this.log('info', `Loaded "${manifest.id}" v${manifest.version} (${state.enabled ? 'enabled' : 'disabled'})`);
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

    for (const [id, plugin] of this.plugins) {
      if (!plugin.enabled || plugin.error) continue;
      if (!plugin.registration.registerRoutes) continue;

      const prefix = plugin.manifest.hooks?.routes?.prefix || `/api/plugins/${id}`;
      try {
        const ctx = createContext(plugin.manifest, this.getContextDeps());
        await app.register(
          async (instance) => {
            await plugin.registration.registerRoutes!(instance, ctx);
          },
          { prefix }
        );
        this.log('info', `Registered routes for "${id}" at ${prefix}`);
      } catch (err) {
        this.log('error', `Failed to register routes for "${id}": ${err}`);
        plugin.error = `Route registration failed: ${err}`;
        plugin.enabled = false;
        // Persist disabled state so the UI reflects the failure
        await prisma.pluginState.update({
          where: { pluginId: id },
          data: { enabled: false },
        }).catch(() => {}); // best-effort
      }
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
    }));
  }

  getPlugin(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
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
