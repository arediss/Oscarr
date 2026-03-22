import { prisma } from './prisma.js';

const CACHE_TTL_HOURS = 24;

export async function getCached<T>(key: string): Promise<T | null> {
  const entry = await prisma.tmdbCache.findUnique({ where: { cacheKey: key } });
  if (!entry) return null;
  if (new Date() > entry.expiresAt) {
    await prisma.tmdbCache.delete({ where: { cacheKey: key } });
    return null;
  }
  return JSON.parse(entry.data) as T;
}

export async function setCache(key: string, data: unknown, ttlHours = CACHE_TTL_HOURS): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await prisma.tmdbCache.upsert({
    where: { cacheKey: key },
    update: { data: JSON.stringify(data), expiresAt },
    create: { cacheKey: key, data: JSON.stringify(data), expiresAt },
  });
}

export async function clearExpiredCache(): Promise<number> {
  const result = await prisma.tmdbCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
