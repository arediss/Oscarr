import type { FastifyBaseLogger } from 'fastify';
import { pluginEventBus } from '../eventBus.js';
import { prisma } from '../../utils/prisma.js';
import { getPluginDataDir } from '../../utils/dataPath.js';
import { notificationRegistry } from '../../notifications/index.js';
import type { NotificationPayload } from '../../notifications/types.js';
import { sendUserNotification } from '../../services/userNotifications.js';
import { getArrClient } from '../../providers/index.js';
import {
  registerRoutePermission as rbacRegisterRoute,
  registerPluginPermission as rbacRegisterPermission,
} from '../../middleware/rbac.js';
import type { PluginContext, PluginManifest } from '../types.js';

/**
 * Dependencies injected by the engine so the factory stays decoupled
 * from PluginEngine internals.
 */
export interface V1FactoryDeps {
  logger: FastifyBaseLogger | null;
  getCachedSettings(pluginId: string): Promise<Record<string, unknown>>;
  setSettingsCache(pluginId: string, values: Record<string, unknown>): void;
  makeFallbackLogger(pluginId: string): FastifyBaseLogger;
}

function createCapturingLogger(
  baseLogger: FastifyBaseLogger,
  pluginId: string
): FastifyBaseLogger {
  const child = baseLogger.child({ plugin: pluginId });

  const capture = (level: string, msg: string) => {
    prisma.pluginLog.create({
      data: { pluginId, level, message: String(msg).slice(0, 2000) },
    }).catch(() => {}); // Fire-and-forget
  };

  // Wrap log methods — use function() + apply() to preserve Pino's overloaded signatures
  const origInfo = child.info;
  const origWarn = child.warn;
  const origError = child.error;

  child.info = function (this: any, ...args: any[]) {
    capture('info', typeof args[0] === 'string' ? args[0] : args[1] || '');
    return origInfo.apply(this, args as any);
  } as typeof child.info;
  child.warn = function (this: any, ...args: any[]) {
    capture('warn', typeof args[0] === 'string' ? args[0] : args[1] || '');
    return origWarn.apply(this, args as any);
  } as typeof child.warn;
  child.error = function (this: any, ...args: any[]) {
    capture('error', typeof args[0] === 'string' ? args[0] : args[1] || '');
    return origError.apply(this, args as any);
  } as typeof child.error;

  return child;
}

/**
 * Frozen V1 context factory.
 * This is a faithful extraction of the former `PluginEngine.createContext`
 * private method -- no behaviour changes.
 */
export function createContextV1(manifest: PluginManifest, deps: V1FactoryDeps): PluginContext {
  const pluginId = manifest.id;
  const log = deps.logger
    ? createCapturingLogger(deps.logger, pluginId)
    : deps.makeFallbackLogger(pluginId);

  return {
    log,
    async getUser(userId: number) {
      return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, displayName: true, role: true },
      });
    },
    async setUserRole(userId: number, roleName: string) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) throw new Error(`Role "${roleName}" does not exist`);
      await prisma.user.update({ where: { id: userId }, data: { role: roleName } });
    },
    getPluginDataDir() {
      return getPluginDataDir(pluginId);
    },
    async getAppSettings() {
      const s = await prisma.appSettings.findUnique({ where: { id: 1 } });
      return (s ?? {}) as Record<string, unknown>;
    },
    async getSetting(key: string) {
      const settings = await deps.getCachedSettings(pluginId);
      return settings[key];
    },
    async setSetting(key: string, value: unknown) {
      const settings = await deps.getCachedSettings(pluginId);
      settings[key] = value;
      await prisma.pluginState.update({
        where: { pluginId },
        data: { settings: JSON.stringify(settings) },
      });
      deps.setSettingsCache(pluginId, settings);
    },
    async sendNotification(type: string, data: NotificationPayload) {
      await notificationRegistry.send(type, data);
    },
    async sendUserNotification(userId: number, payload) {
      await sendUserNotification(userId, payload);
    },
    notificationRegistry,
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
    registerRoutePermission(routeKey: string, rule: { permission: string; ownerScoped?: boolean }) {
      rbacRegisterRoute(routeKey, rule);
    },
    registerPluginPermission(permission: string, description?: string) {
      rbacRegisterPermission(permission, description);
    },
    events: {
      on: (event, handler) => pluginEventBus.on(event, handler),
      off: (event, handler) => pluginEventBus.off(event, handler),
      emit: (event, data) => pluginEventBus.emit(event, data),
    },
  };
}
