import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Minimal Fastify-lookalike router used to dispatch plugin sub-routes.
 *
 * Plugins build one of these at registerRoutes() time; the engine keeps it in a Map keyed by
 * plugin id and a single catch-all Fastify route forwards incoming requests through match().
 * Dropping a plugin's entry from the map is enough to "unregister" all its routes — no Fastify
 * restart, no duplicate-prefix errors, no 404 fallback handlers.
 *
 * Only the surface actually used by Oscarr's plugins is supported:
 *   - .get/.post/.put/.delete/.patch with the Fastify handler signature
 *   - .addHook('preHandler', fn) — chained before each handler
 *   - path params via ':name' segments (no wildcards, no regex)
 *
 * Fastify's real request/reply are passed through untouched; all decorators (setCookie, jwt,
 * …) keep working because plugins never see a shim.
 */

export type RouteHandler = (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>;
export type PreHandlerHook = (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>;

interface RouteEntry {
  method: string;
  pattern: string;
  segments: string[];
  handler: RouteHandler;
}

export interface RouteMatch {
  entry: RouteEntry;
  params: Record<string, string>;
}

export class PluginRouter {
  private readonly routes: RouteEntry[] = [];
  private readonly hooks: PreHandlerHook[] = [];

  addHook(event: 'preHandler', fn: PreHandlerHook): void {
    if (event !== 'preHandler') {
      throw new Error(`PluginRouter: only 'preHandler' hook is supported (got '${event}')`);
    }
    this.hooks.push(fn);
  }

  get(path: string, handler: RouteHandler): void;
  get(path: string, opts: unknown, handler: RouteHandler): void;
  get(path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler): void {
    this.register('GET', path, optsOrHandler, maybeHandler);
  }

  post(path: string, handler: RouteHandler): void;
  post(path: string, opts: unknown, handler: RouteHandler): void;
  post(path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler): void {
    this.register('POST', path, optsOrHandler, maybeHandler);
  }

  put(path: string, handler: RouteHandler): void;
  put(path: string, opts: unknown, handler: RouteHandler): void;
  put(path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler): void {
    this.register('PUT', path, optsOrHandler, maybeHandler);
  }

  delete(path: string, handler: RouteHandler): void;
  delete(path: string, opts: unknown, handler: RouteHandler): void;
  delete(path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler): void {
    this.register('DELETE', path, optsOrHandler, maybeHandler);
  }

  patch(path: string, handler: RouteHandler): void;
  patch(path: string, opts: unknown, handler: RouteHandler): void;
  patch(path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler): void {
    this.register('PATCH', path, optsOrHandler, maybeHandler);
  }

  private register(method: string, path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler): void {
    const handler = (typeof optsOrHandler === 'function' ? optsOrHandler : maybeHandler) as RouteHandler | undefined;
    if (typeof handler !== 'function') {
      throw new Error(`PluginRouter.${method.toLowerCase()}: handler must be a function`);
    }
    if (!path.startsWith('/')) {
      throw new Error(`PluginRouter.${method.toLowerCase()}: path must start with '/' (got "${path}")`);
    }
    this.routes.push({ method, pattern: path, segments: path.split('/'), handler });
  }

  match(method: string, url: string): RouteMatch | null {
    const path = url.split('?')[0];
    const urlSegments = path.split('/');
    for (const entry of this.routes) {
      if (entry.method !== method) continue;
      if (entry.segments.length !== urlSegments.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < entry.segments.length; i++) {
        const seg = entry.segments[i];
        const u = urlSegments[i];
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(u);
        } else if (seg !== u) {
          ok = false;
          break;
        }
      }
      if (ok) return { entry, params };
    }
    return null;
  }

  async runHandler(match: RouteMatch, request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    for (const hook of this.hooks) {
      await hook(request, reply);
      if (reply.sent) return;
    }
    return match.entry.handler(request, reply);
  }

  listRoutes(): Array<{ method: string; pattern: string }> {
    return this.routes.map((r) => ({ method: r.method, pattern: r.pattern }));
  }
}
