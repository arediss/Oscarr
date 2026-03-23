import { prisma } from './prisma.js';

export interface ServiceWithConfig {
  id: number;
  name: string;
  type: string;
  config: Record<string, string>;
  isDefault: boolean;
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
    return JSON.parse(fallback.config);
  }
  return JSON.parse(service.config);
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
    config: JSON.parse(s.config),
    isDefault: s.isDefault,
  }));
}

/** Get a specific service by ID with parsed config */
export async function getServiceById(id: number): Promise<ServiceWithConfig | null> {
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service || !service.enabled) return null;
  return {
    id: service.id,
    name: service.name,
    type: service.type,
    config: JSON.parse(service.config),
    isDefault: service.isDefault,
  };
}
