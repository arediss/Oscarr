import type { FastifyRequest } from 'fastify';

/**
 * Resolve Oscarr's public base URL (protocol + host, no trailing slash).
 *
 * Priority:
 *   1. OSCARR_PUBLIC_URL env var — authoritative when set. Use for deploys where the admin
 *      reaches Oscarr through a different hostname than end users, or when requests come
 *      from multiple origins and the OAuth redirect_uri must be stable.
 *   2. x-forwarded-proto + x-forwarded-host — for reverse-proxy setups.
 *   3. request.protocol + request.hostname — Fastify's fallback.
 *
 * Callers that need a full URL (e.g. OAuth callback) concatenate a path themselves.
 */
export function resolvePublicBaseUrl(request: FastifyRequest): string {
  const fromEnv = process.env.OSCARR_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  const fwdProto = (request.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const fwdHost = (request.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
  const proto = fwdProto || request.protocol;
  const host = fwdHost || request.hostname;
  return `${proto}://${host}`;
}

/** Absolute callback URL for an OAuth provider — used in both the authorize and callback endpoints so the redirect_uri Discord sees matches the one we registered at authorize time. */
export function resolveOAuthCallbackUrl(request: FastifyRequest, providerId: string): string {
  return `${resolvePublicBaseUrl(request)}/api/auth/${providerId}/callback`;
}
