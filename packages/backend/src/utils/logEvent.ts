import { prisma } from './prisma.js';

export async function logEvent(level: 'info' | 'warn' | 'error', label: string, message: string) {
  try {
    await prisma.appLog.create({ data: { level, label, message } });
  } catch {
    // Silently fail if table doesn't exist yet
  }
}
