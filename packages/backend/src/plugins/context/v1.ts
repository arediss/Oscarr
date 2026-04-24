import type { FastifyBaseLogger } from 'fastify';
import { pluginEventBus } from '../eventBus.js';
import { prisma } from '../../utils/prisma.js';
import { getPluginDataDir } from '../../utils/dataPath.js';
import { scrubSecrets } from '../../utils/logScrubber.js';
import { notificationRegistry } from '../../notifications/index.js';
import type { NotificationPayload } from '../../notifications/types.js';
import { sendUserNotification } from '../../services/userNotifications.js';
import { getArrClient } from '../../providers/index.js';
import type { ArrClient } from '../../providers/types.js';
import {
  registerRoutePermission as rbacRegisterRoute,
  registerPluginPermission as rbacRegisterPermission,
} from '../../middleware/rbac.js';
import type { PluginCapability, PluginContext, PluginManifest } from '../types.js';

/**
 * Dependencies injected by the engine so the factory stays decoupled
 * from PluginEngine internals.
 */
export interface V1FactoryDeps {
  logger: FastifyBaseLogger | null;
  getCachedSettings(pluginId: string): Promise<Record<string, unknown>>;
  setSettingsCache(pluginId: string, values: Record<string, unknown>): void;
  makeFallbackLogger(pluginId: string): FastifyBaseLogger;
  /** Signs a JWT payload using the app's JWT secret. Available only after the engine is registered with Fastify. */
  signAuthToken(payload: { id: number; email: string; role: string }): string;
}

// Rate-limit plugin log persistence per pluginId so a misbehaving plugin in a loop can't flood
// PluginLog (exhaust disk / slow down the admin UI). The structured log via the parent Pino
// child still fires — only the DB write is throttled.
const LOG_RATE_WINDOW_MS = 10_000;
const LOG_RATE_MAX = 100;
const logRateCounters = new Map<string, { count: number; windowStart: number; droppedSinceSummary: number }>();

export function clearLogRateCounter(pluginId: string): void {
  logRateCounters.delete(pluginId);
}

function shouldPersistLog(pluginId: string): boolean {
  const now = Date.now();
  let c = logRateCounters.get(pluginId);
  if (!c || now - c.windowStart > LOG_RATE_WINDOW_MS) {
    c = { count: 0, windowStart: now, droppedSinceSummary: 0 };
    logRateCounters.set(pluginId, c);
  }
  if (c.count < LOG_RATE_MAX) {
    c.count++;
    return true;
  }
  c.droppedSinceSummary++;
  // On first overflow of the window, write one summary line so the admin sees what happened.
  if (c.droppedSinceSummary === 1) {
    prisma.pluginLog.create({
      data: {
        pluginId,
        level: 'warn',
        message: `[rate-limited] exceeded ${LOG_RATE_MAX} log lines in ${LOG_RATE_WINDOW_MS / 1000}s — further logs in this window are dropped`,
      },
    }).catch(() => {});
  }
  return false;
}

function createCapturingLogger(
  baseLogger: FastifyBaseLogger,
  pluginId: string
): FastifyBaseLogger {
  const child = baseLogger.child({ plugin: pluginId });

  const capture = (level: string, msg: string) => {
    if (!shouldPersistLog(pluginId)) return;
    // Scrub secrets before persistence — PluginLog is exposed in the admin UI,
    // so a careless `ctx.log.info(config)` must not leak tokens/keys there.
    const scrubbed = scrubSecrets(String(msg)).slice(0, 2000);
    prisma.pluginLog.create({
      data: { pluginId, level, message: scrubbed },
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
/**
 * Service config access-control — a plugin can only read the config of services it declared in
 * its manifest's `services` array. Missing / empty = no access. Denied requests return null and
 * log a warning so a misconfigured plugin is easy to diagnose.
 */
function checkServiceAccess(pluginId: string, allowedServices: string[] | undefined, serviceType: string, logger: FastifyBaseLogger): boolean {
  if (!allowedServices || allowedServices.length === 0) {
    logger.warn(
      { plugin: pluginId, attemptedService: serviceType },
      `[plugins] Plugin "${pluginId}" requested service "${serviceType}" but declares no services in its manifest — access denied`
    );
    return false;
  }
  if (!allowedServices.includes(serviceType)) {
    logger.warn(
      { plugin: pluginId, attemptedService: serviceType, allowed: allowedServices },
      `[plugins] Plugin "${pluginId}" requested service "${serviceType}" which is not in its manifest services list — access denied`
    );
    return false;
  }
  return true;
}

/**
 * Capability enforcement — any ctx method covered by a capability throws at call time if the plugin
 * didn't declare that capability in its manifest. We keep the method present on the returned object
 * (rather than `undefined`) so the error message is actionable instead of "undefined is not a function".
 * `log` is always granted (no sensitive access). Service methods are gated separately by L2 (services list).
 */
function requireCapability(
  pluginId: string,
  allowedCaps: ReadonlySet<PluginCapability>,
  required: PluginCapability,
  methodName: string
): void {
  if (!allowedCaps.has(required)) {
    throw new Error(
      `Plugin "${pluginId}" called ${methodName}() but didn't declare capability "${required}" in its manifest. ` +
      `Add "${required}" to manifest.capabilities to grant access.`
    );
  }
}

export function createContextV1(manifest: PluginManifest, deps: V1FactoryDeps): PluginContext {
  const pluginId = manifest.id;
  const log = deps.logger
    ? createCapturingLogger(deps.logger, pluginId)
    : deps.makeFallbackLogger(pluginId);
  const allowedServices = manifest.services;
  const caps = new Set<PluginCapability>(manifest.capabilities ?? []);
  const aclLogger = deps.logger ?? log;
  const req = (cap: PluginCapability, method: string) => requireCapability(pluginId, caps, cap, method);

  return {
    log,
    async getUser(userId: number) {
      req('users:read', 'getUser');
      return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, displayName: true, role: true, avatar: true },
      });
    },
    async findUserByEmail(email: string) {
      req('users:read', 'findUserByEmail');
      return prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, displayName: true, role: true, avatar: true },
      });
    },
    async findUserByProvider(provider: string, providerId: string) {
      req('users:read', 'findUserByProvider');
      const link = await prisma.userProvider.findUnique({
        where: { provider_providerId: { provider, providerId } },
        include: { user: { select: { id: true, email: true, displayName: true, role: true, avatar: true } } },
      });
      return link?.user ?? null;
    },
    async setUserRole(userId: number, roleName: string) {
      req('users:write', 'setUserRole');
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) throw new Error(`Role "${roleName}" does not exist`);
      await prisma.user.update({ where: { id: userId }, data: { role: roleName } });
    },
    async setUserDisabled(userId: number, disabled: boolean) {
      req('users:write', 'setUserDisabled');
      if (disabled) {
        const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (target?.role === 'admin') {
          throw new Error(`Refusing to disable user ${userId}: admins cannot be disabled from plugin code`);
        }
      }
      await prisma.user.update({ where: { id: userId }, data: { disabled } });
    },
    async issueAuthToken(userId: number) {
      req('users:write', 'issueAuthToken');
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true },
      });
      if (!user) throw new Error(`User ${userId} not found`);
      return deps.signAuthToken({ id: user.id, email: user.email, role: user.role });
    },
    getPluginDataDir() {
      req('settings:plugin', 'getPluginDataDir');
      return getPluginDataDir(pluginId);
    },
    async getAppSettings() {
      req('settings:app', 'getAppSettings');
      const s = await prisma.appSettings.findUnique({ where: { id: 1 } });
      return (s ?? {}) as Record<string, unknown>;
    },
    async getSetting(key: string) {
      req('settings:plugin', 'getSetting');
      const settings = await deps.getCachedSettings(pluginId);
      return settings[key];
    },
    async setSetting(key: string, value: unknown) {
      req('settings:plugin', 'setSetting');
      const settings = await deps.getCachedSettings(pluginId);
      settings[key] = value;
      await prisma.pluginState.update({
        where: { pluginId },
        data: { settings: JSON.stringify(settings) },
      });
      deps.setSettingsCache(pluginId, settings);
    },
    async sendNotification(type: string, data: NotificationPayload) {
      req('notifications', 'sendNotification');
      await notificationRegistry.send(type, data);
    },
    async sendUserNotification(userId: number, payload) {
      req('notifications', 'sendUserNotification');
      await sendUserNotification(userId, payload);
    },
    notificationRegistry,
    getArrClient: (serviceType: string) => {
      if (!checkServiceAccess(pluginId, allowedServices, serviceType, aclLogger)) {
        throw new Error(`Plugin "${pluginId}" is not allowed to access service "${serviceType}" — declare it in manifest.services`);
      }
      return getArrClient(serviceType);
    },
    async getServiceConfig(serviceType: string) {
      if (!checkServiceAccess(pluginId, allowedServices, serviceType, aclLogger)) return null;
      const svc = await prisma.service.findFirst({ where: { type: serviceType } });
      if (!svc) return null;
      try {
        const config = JSON.parse(svc.config);
        return { url: config.url || config.baseUrl, apiKey: config.apiKey };
      } catch {
        return null;
      }
    },
    async getServiceConfigRaw(serviceType: string) {
      if (!checkServiceAccess(pluginId, allowedServices, serviceType, aclLogger)) return null;
      const svc = await prisma.service.findFirst({ where: { type: serviceType } });
      if (!svc) return null;
      try {
        return JSON.parse(svc.config) as Record<string, unknown>;
      } catch {
        return null;
      }
    },
    async getUserProviders(userId: number) {
      req('users:read', 'getUserProviders');
      const providers = await prisma.userProvider.findMany({
        where: { userId },
        select: { provider: true, providerId: true, providerUsername: true, providerEmail: true },
      });
      return providers;
    },
    registerRoutePermission(routeKey: string, rule: { permission: string; ownerScoped?: boolean }) {
      req('permissions', 'registerRoutePermission');
      // A plugin can only rewrite RBAC rules for routes under its own namespace — without this
      // guard a plugin with the `permissions` capability could downgrade core admin routes
      // (e.g. `POST:/api/plugins/install`) to $public and escalate arbitrarily.
      const parsed = routeKey.match(/^([A-Z]+):(\/.+)$/);
      const allowedPrefix = `/api/plugins/${pluginId}/`;
      if (!parsed || !parsed[2].startsWith(allowedPrefix)) {
        throw new Error(
          `Plugin "${pluginId}" may only register route permissions under ${allowedPrefix} (got "${routeKey}")`
        );
      }
      rbacRegisterRoute(pluginId, routeKey, rule);
    },
    registerPluginPermission(permission: string, description?: string) {
      req('permissions', 'registerPluginPermission');
      rbacRegisterPermission(pluginId, permission, description);
    },
    events: {
      on: (event, handler) => {
        req('events', 'events.on');
        pluginEventBus.on(event, handler);
      },
      off: (event, handler) => {
        req('events', 'events.off');
        pluginEventBus.off(event, handler);
      },
      emit: (event, data) => {
        req('events', 'events.emit');
        return pluginEventBus.emit(event, data);
      },
    },

    // ─── v1.1 additions — stubs filled in by subsequent phase commits ───
    // Each method here is a typed placeholder so the `PluginContext` type is satisfied; the
    // real implementation lands in the corresponding phase (see feat/plugin-ctx-v1.1 PR).
    // Stubs throw with a recognisable error so any accidental call before its phase lands
    // surfaces loudly instead of silently returning undefined.

    async getArrClients(_serviceType: string): Promise<ArrClient[]> {
      throw new Error('ctx.getArrClients: not implemented (Phase 2)');
    },
    tmdb: {
      async search(_query: string) {
        req('tmdb:read', 'tmdb.search');
        throw new Error('ctx.tmdb.search: not implemented (Phase 1 P2)');
      },
      async movie(_tmdbId: number) {
        req('tmdb:read', 'tmdb.movie');
        throw new Error('ctx.tmdb.movie: not implemented (Phase 1 P2)');
      },
      async tv(_tmdbId: number) {
        req('tmdb:read', 'tmdb.tv');
        throw new Error('ctx.tmdb.tv: not implemented (Phase 1 P2)');
      },
    },
    media: {
      async batchStatus(_items, _userId) {
        req('requests:read', 'media.batchStatus');
        throw new Error('ctx.media.batchStatus: not implemented (Phase 1 P3)');
      },
      async getById(_mediaId: number) {
        req('requests:read', 'media.getById');
        throw new Error('ctx.media.getById: not implemented (Phase 1 P3)');
      },
    },
    requests: {
      async listForUser(_userId: number) {
        req('requests:read', 'requests.listForUser');
        throw new Error('ctx.requests.listForUser: not implemented (Phase 1 P3)');
      },
      async create(_input) {
        req('requests:write', 'requests.create');
        throw new Error('ctx.requests.create: not implemented (Phase 1 P4)');
      },
    },
    async listFolderRules(_options?) {
      throw new Error('ctx.listFolderRules: not implemented (Phase 2)');
    },
  };
}
