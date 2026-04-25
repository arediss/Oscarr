import { PrismaClient } from '@prisma/client';
import { logEvent } from './logEvent.js';

export const prisma = new PrismaClient();

// WAL: readers don't block while a writer holds the lock.
prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;')
  .catch((err) => logEvent('warn', 'Prisma', `Failed to enable WAL mode: ${err}`));
