import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/** Bundled build (esbuild): __BUNDLED__ is replaced with the literal `true`. In tsx/tsc mode
 *  it stays undeclared — `typeof` is safe on undeclared identifiers (returns 'undefined'), so
 *  this check doesn't throw in non-bundled runs. */
declare const __BUNDLED__: boolean;
const isBundled = typeof __BUNDLED__ !== 'undefined' && __BUNDLED__;

const thisDir = dirname(fileURLToPath(import.meta.url));

// Bundled: this file is inlined into dist/server.js → thisDir = packages/backend/dist, so BACKEND_ROOT is thisDir/..
// tsc:     this file is dist/utils/paths.js       → thisDir = packages/backend/dist/utils, so BACKEND_ROOT is thisDir/../..
// tsx dev: this file is src/utils/paths.ts        → thisDir = packages/backend/src/utils,  same ../../ from dir.
export const BACKEND_ROOT = isBundled ? resolve(thisDir, '..') : resolve(thisDir, '../..');
export const BACKEND_DIST = resolve(BACKEND_ROOT, 'dist');
export const BACKEND_PRISMA_DIR = resolve(BACKEND_ROOT, 'prisma');
export const BACKEND_PACKAGE_JSON = resolve(BACKEND_ROOT, 'package.json');

export const PROJECT_ROOT = resolve(BACKEND_ROOT, '../..');
export const PROJECT_PACKAGE_JSON = resolve(PROJECT_ROOT, 'package.json');
export const PROJECT_ENV_FILE = resolve(PROJECT_ROOT, '.env');
export const FRONTEND_DIST = resolve(PROJECT_ROOT, 'packages/frontend/dist');
export const PLUGINS_DIR = resolve(PROJECT_ROOT, 'plugins');
