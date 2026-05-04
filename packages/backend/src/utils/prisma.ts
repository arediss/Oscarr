import { PrismaClient } from '@prisma/client';
import { logEvent } from './logEvent.js';

export const prisma = new PrismaClient();

// WAL: readers don't block while a writer holds the lock. PRAGMA returns the resulting mode
// as a row, so it has to go through $queryRawUnsafe — $executeRawUnsafe rejects result rows.
prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;')
  .catch((err) => logEvent('warn', 'Prisma', `Failed to enable WAL mode: ${err}`));
