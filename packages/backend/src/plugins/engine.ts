import { join } from 'path';
import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { notificationRegistry } from '../notifications/index.js';
import type { NotificationPayload } from '../notifications/types.js';
import { sendUserNotification } from '../services/userNotifications.js';
import { getArrClient } from '../providers/index.js';
import { discoverPlugins } from './loader.js';
import type {
  LoadedPlugin,
  PluginContext,
  PluginGuardResult,
  PluginInfo,
  PluginManifest,
  PluginRegistration,
  UIContribution,
} from './types.js';

export class PluginEngine {
  private plugins = new Map<string, LoadedPlugin>();

  async loadAll(): Promise<void> {
    const discovered = await discoverPlugins();
    console.log(`[PluginEngine] Discovered ${discovered.length} plugin(s)`);

    for (const { dir, manifest } of discovered) {
      try {
        // Ensure PluginState row exists
        const state = await prisma.pluginState.upsert({
          where: { pluginId: manifest.id },
          update: {},
          create: { pluginId: manifest.id, enabled: true, settings: '{}' },
        });

        // Import the plugin entry module
        const entryPath = join(dir, manifest.entry);
        const mod = await import(entryPath);

        if (typeof mod.register !== 'function') {
          throw new Error(`Plugin "${manifest.id}" does not export a register() function`);
        }

        const ctx = this.createContext(manifest, this.createFallbackLogger());
        const registration: PluginRegistration = await mod.register(ctx);

        // Run onInstall on first load
        if (state.settings === '{}' && registration.onInstall) {
          await registration.onInstall(ctx);
          console.log(`[PluginEngine] Ran onInstall for "${manifest.id}"`);
        }

        // Register notification providers from plugin
        if (registration.registerNotificationProviders) {
          registration.registerNotificationProviders(notificationRegistry);
          console.log(`[PluginEngine] Registered notification providers for "${manifest.id}"`);
        }

        this.plugins.set(manifest.id, {
          manifest,
          registration,
          dir,
          enabled: state.enabled,
        });

        console.log(`[PluginEngine] Loaded "${manifest.id}" v${manifest.version} (${state.enabled ? 'enabled' : 'disabled'})`);
      } catch (err) {
        console.error(`[PluginEngine] Failed to load plugin "${manifest.id}":`, err);
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
    for (const [id, plugin] of this.plugins) {
      if (!plugin.enabled || plugin.error) continue;
      if (!plugin.registration.registerRoutes) continue;

      const prefix = plugin.manifest.hooks?.routes?.prefix || `/api/plugins/${id}`;
      try {
        const ctx = this.createContext(plugin.manifest, app.log);
        await app.register(
          async (instance) => {
            await plugin.registration.registerRoutes!(instance, ctx);
          },
          { prefix }
        );
        console.log(`[PluginEngine] Registered routes for "${id}" at ${prefix}`);
      } catch (err) {
        console.error(`[PluginEngine] Failed to register routes for "${id}":`, err);
        plugin.error = `Route registration failed: ${err}`;
      }
    }
  }

  getJobHandlers(): Record<string, () => Promise<unknown>> {
    const handlers: Record<string, () => Promise<unknown>> = {};
    for (const [id, plugin] of this.plugins) {
      if (!plugin.enabled || plugin.error || !plugin.registration.registerJobs) continue;
      try {
        const ctx = this.createContext(plugin.manifest, this.createFallbackLogger());
        const jobs = plugin.registration.registerJobs(ctx);
        for (const [key, handler] of Object.entries(jobs)) {
          handlers[key] = handler;
        }
      } catch (err) {
        console.error(`[PluginEngine] Failed to get job handlers for "${id}":`, err);
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

  getUIContributions(hookPoint: string): (UIContribution & { pluginId: string })[] {
    const contributions: (UIContribution & { pluginId: string })[] = [];
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

    await prisma.pluginState.update({
      where: { pluginId: id },
      data: { enabled },
    });
    plugin.enabled = enabled;
  }

  async getSettings(id: string): Promise<{ schema: PluginManifest['settings']; values: Record<string, unknown> }> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin "${id}" not found`);

    const state = await prisma.pluginState.findUnique({ where: { pluginId: id } });
    const values = state ? JSON.parse(state.settings) : {};

    return { schema: plugin.manifest.settings || [], values };
  }

  async updateSettings(id: string, values: Record<string, unknown>): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin "${id}" not found`);

    await prisma.pluginState.update({
      where: { pluginId: id },
      data: { settings: JSON.stringify(values) },
    });
  }

  /** Run all plugin guards for a given hook. Returns the first block result, or null if all pass. */
  async runGuards(guardName: string, userId: number): Promise<PluginGuardResult | null> {
    for (const [id, plugin] of this.plugins) {
      if (!plugin.enabled || plugin.error || !plugin.registration.registerGuards) continue;
      try {
        const ctx = this.createContext(plugin.manifest, this.createFallbackLogger());
        const guards = plugin.registration.registerGuards(ctx);
        const guard = guards[guardName];
        if (!guard) continue;
        const result = await guard(userId);
        if (result?.blocked) return result;
      } catch (err) {
        console.error(`[PluginEngine] Guard "${guardName}" failed for plugin "${id}":`, err);
      }
    }
    return null;
  }

  private createFallbackLogger(): FastifyBaseLogger {
    const log = Object.assign((...args: unknown[]) => console.log(...args), {
      info: (...args: unknown[]) => console.info('[Plugin]', ...args),
      warn: (...args: unknown[]) => console.warn('[Plugin]', ...args),
      error: (...args: unknown[]) => console.error('[Plugin]', ...args),
      debug: (...args: unknown[]) => console.debug('[Plugin]', ...args),
      fatal: (...args: unknown[]) => console.error('[Plugin:FATAL]', ...args),
      trace: (...args: unknown[]) => console.debug('[Plugin:TRACE]', ...args),
      silent: () => {},
      child: () => log,
      level: 'info',
    });
    return log as unknown as FastifyBaseLogger;
  }

  private createContext(manifest: PluginManifest, logger: FastifyBaseLogger): PluginContext {
    const pluginId = manifest.id;
    return {
      log: logger.child({ plugin: pluginId }),
      async getUser(userId: number) {
        return prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, displayName: true, role: true },
        });
      },
      async getAppSettings() {
        const s = await prisma.appSettings.findUnique({ where: { id: 1 } });
        return (s ?? {}) as Record<string, unknown>;
      },
      async getSetting(key: string) {
        const state = await prisma.pluginState.findUnique({ where: { pluginId } });
        if (!state) return undefined;
        const settings = JSON.parse(state.settings);
        return settings[key];
      },
      async setSetting(key: string, value: unknown) {
        const state = await prisma.pluginState.findUnique({ where: { pluginId } });
        const settings = state ? JSON.parse(state.settings) : {};
        settings[key] = value;
        await prisma.pluginState.update({
          where: { pluginId },
          data: { settings: JSON.stringify(settings) },
        });
      },
      async sendNotification(type: string, data: NotificationPayload) {
        await notificationRegistry.send(type, data);
      },
      async sendUserNotification(userId: number, payload: { type: string; title: string; message: string; metadata?: Record<string, unknown> }) {
        await sendUserNotification(userId, payload);
      },
      notificationRegistry: notificationRegistry,
      getArrClient: (serviceType: string) => getArrClient(serviceType),
      async getServiceConfig(serviceType: string) {
        const svc = await prisma.service.findFirst({ where: { type: serviceType } });
        if (!svc) return null;
        try {
          const config = JSON.parse(svc.config);
          return { url: config.url || config.baseUrl, apiKey: config.apiKey };
        } catch {
          return null;
        }
      },
    };
  }
}

// Singleton
export const pluginEngine = new PluginEngine();
