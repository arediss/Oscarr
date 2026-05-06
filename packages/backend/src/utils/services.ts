import { prisma } from './prisma.js';

export interface ServiceWithConfig {
  id: number;
  name: string;
  type: string;
  config: Record<string, string>;
  isDefault: boolean;
}

/** Parse a Service row's stringified JSON config. Single source of truth — any future change
 *  to the on-disk format (encryption at rest, versioning, etc.) lives here. Callers that held
 *  a raw prisma row and called `JSON.parse(row.config)` should now go through this. */
export function parseServiceConfig(configString: string): Record<string, string> {
  return JSON.parse(configString) as Record<string, string>;
}

/** Get a single service config (first default, then any enabled). Used for backwards compat. */
export async function getServiceConfig(type: string): Promise<Record<string, string> | null> {
  const service = await prisma.service.findFirst({
    where: { type, enabled: true, isDefault: true },
  });
  if (!service) {
    const fallback = await prisma.service.findFirst({
      where: { type, enabled: true },
    });
    if (!fallback) return null;
    return parseServiceConfig(fallback.config);
  }
  return parseServiceConfig(service.config);
}

/** Get ALL enabled services of a given type, with parsed config */
export async function getAllServices(type: string): Promise<ServiceWithConfig[]> {
  const services = await prisma.service.findMany({
    where: { type, enabled: true },
    orderBy: { isDefault: 'desc' },
  });
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    config: parseServiceConfig(s.config),
    isDefault: s.isDefault,
  }));
}

/** Get a specific service by ID with parsed config */
export async function getServiceById(id: number): Promise<ServiceWithConfig | null> {
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service?.enabled) return null;
  return {
    id: service.id,
    name: service.name,
    type: service.type,
    config: parseServiceConfig(service.config),
    isDefault: service.isDefault,
  };
}
