import { prisma } from './prisma.js';

export async function getServiceConfig(type: string): Promise<Record<string, string> | null> {
  const service = await prisma.service.findFirst({
    where: { type, enabled: true, isDefault: true },
  });
  if (!service) {
    // Fallback: any enabled service of this type
    const fallback = await prisma.service.findFirst({
      where: { type, enabled: true },
    });
    if (!fallback) return null;
    return JSON.parse(fallback.config);
  }
  return JSON.parse(service.config);
}
