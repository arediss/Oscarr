import { prisma } from './prisma.js';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/** Strip newlines/tabs to prevent log injection */
function sanitize(input: string): string {
  return input.replace(/[\r\n\t]/g, '');
}

export async function logEvent(level: LogLevel, label: string, message: string) {
  const safeMessage = sanitize(message);
  if (level === 'debug') {
    console.log(`[${label}] ${safeMessage}`);
    // Only persist debug logs when explicitly enabled (for support bundles)
    if (process.env.DEBUG_LOGS !== 'true') return;
  }
  try {
    await prisma.appLog.create({ data: { level, label: sanitize(label), message: safeMessage } });
  } catch {
    // Silently fail if table doesn't exist yet
  }
}
