import { lookup as dnsLookup } from 'node:dns/promises';

/** SSRF guard for admin-typed URLs. Permissive by default (self-hosted LAN). Opt into strict
 *  mode via OSCARR_BLOCK_PRIVATE_SERVICES=true for cloud/shared hosting. */

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 127) return true;                       // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;          // 169.254.0.0/16 link-local (AWS IMDS)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16
  if (a === 0) return true;                         // 0.0.0.0/8
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;                       // loopback
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 ULA
  if (lower.startsWith('fe80:')) return true;             // link-local
  return false;
}

/** WHATWG URL.hostname preserves brackets on IPv6 literals ([::1]). Strip them so downstream
 *  checks see the bare address. Also map IPv4-embedded-in-IPv6 forms (both ::ffff:a.b.c.d and
 *  the hex-normalized ::ffff:7f00:1) to the underlying IPv4 — otherwise http://[::ffff:127.0.0.1]
 *  bypasses every check by hitting neither the IPv4 regex nor the IPv6 private list. */
export function normalizeHost(hostname: string): { host: string; mappedIPv4?: string } {
  const bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(bare);
  if (dotted) return { host: bare, mappedIPv4: dotted[1] };
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(bare);
  if (hex) {
    const hi = Number.parseInt(hex[1], 16);
    const lo = Number.parseInt(hex[2], 16);
    return { host: bare, mappedIPv4: `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}` };
  }
  return { host: bare };
}

export function isPrivateAddress(address: string, family: number): boolean {
  return family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
}

export function arePrivateAddressesAllowed(): boolean {
  return process.env.OSCARR_BLOCK_PRIVATE_SERVICES !== 'true';
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/** Throws SsrfBlockedError if the URL resolves to a private address and the guard is enabled. */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  if (arePrivateAddressesAllowed()) return;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(`Refusing non-HTTP protocol: ${parsed.protocol}`);
  }

  if (!parsed.hostname) throw new SsrfBlockedError('URL has no hostname');
  const { host, mappedIPv4 } = normalizeHost(parsed.hostname);

  // IPv4-mapped IPv6 routes via the IPv4 stack — check the embedded IPv4 before anything else.
  if (mappedIPv4) {
    if (isPrivateIPv4(mappedIPv4)) throw new SsrfBlockedError(`Refusing IPv4-mapped IPv6 ${host} → ${mappedIPv4} (private)`);
    return;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIPv4(host)) throw new SsrfBlockedError(`Refusing private IPv4 ${host}`);
    return;
  }
  if (host.includes(':')) {
    if (isPrivateIPv6(host)) throw new SsrfBlockedError(`Refusing private IPv6 ${host}`);
    return;
  }

  // Fail closed if ANY resolved address is private (round-robin mix of public/internal).
  const addresses = await dnsLookup(host, { all: true })
    .catch(() => [] as Array<{ address: string; family: number }>);
  if (addresses.length === 0) throw new SsrfBlockedError(`DNS lookup failed for ${host}`);

  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) throw new SsrfBlockedError(`Refusing ${host} → ${address} (private network)`);
  }
}
