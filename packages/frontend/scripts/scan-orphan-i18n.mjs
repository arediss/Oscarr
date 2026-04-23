#!/usr/bin/env node
/**
 * Scans frontend source for every i18n key reference and compares against the
 * translation catalogue. Outputs three buckets:
 *
 *   - USED    — static `t('foo.bar')` hits the key literally
 *   - PREFIX  — dynamic `t(\`foo.${var}\`)` keeps every `foo.*` key alive (we keep these)
 *   - ORPHAN  — neither matches → safe to delete from EN + FR
 *
 * Run:   node packages/frontend/scripts/scan-orphan-i18n.mjs
 *        node packages/frontend/scripts/scan-orphan-i18n.mjs --purge   (rewrites translation.json)
 *
 * Errors on the side of caution: any key that shares a prefix (up to the last dot) with a
 * dynamic pattern is kept. Better to leave a truly dead key than to delete one still used
 * through a template string.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
// Backend also defines translation keys (labelKey fields in provider schemas, notification
// event keys, etc.) that the frontend resolves dynamically — scan both.
const BACKEND_SRC = resolve(ROOT, '../backend/src');
const LOCALES_DIR = join(SRC, 'i18n', 'locales');
const PURGE = process.argv.includes('--purge');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Any string literal that looks like a dotted i18n key — `'common.api_key'`, "nav.home",
// etc. Keys flow through `t()` indirectly (stored in config objects, labelKey fields,
// enum-like maps), so we can't restrict to `t('...')` call sites. Broad capture + compare
// to translation keys errors on the side of keeping live strings.
const LITERAL_RE = /['"]([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_-]+)+)['"]/g;
// Any template literal of the form `<prefix>.${...}` — `<prefix>.*` is considered in use.
const DYNAMIC_TEMPLATE_RE = /`([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\.\$\{/g;

const staticKeys = new Set();
const dynamicPrefixes = new Set();

for (const f of [...walk(SRC), ...walk(BACKEND_SRC)]) {
  const src = readFileSync(f, 'utf-8');
  for (const m of src.matchAll(LITERAL_RE)) staticKeys.add(m[1]);
  for (const m of src.matchAll(DYNAMIC_TEMPLATE_RE)) dynamicPrefixes.add(m[1]);
}

function isDynamicMatch(key) {
  for (const p of dynamicPrefixes) {
    if (key === p || key.startsWith(p + '.')) return true;
  }
  return false;
}

// i18next plural suffix handling — `search.result_one` / `_other` are selected by count when
// the code calls `t('search.result', { count: N })`. Both variants should be kept if the base
// form is in the used set.
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];
function isPluralOfUsed(key) {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) {
      const base = key.slice(0, -suffix.length);
      if (staticKeys.has(base) || isDynamicMatch(base)) return true;
    }
  }
  return false;
}

const LOCALES = readdirSync(LOCALES_DIR);
const report = {};
let totalOrphans = 0;

for (const locale of LOCALES) {
  const path = join(LOCALES_DIR, locale, 'translation.json');
  const json = JSON.parse(readFileSync(path, 'utf-8'));
  const keys = Object.keys(json);
  const orphans = [];
  const dynamicKept = [];
  for (const k of keys) {
    if (staticKeys.has(k)) continue;
    if (isDynamicMatch(k)) { dynamicKept.push(k); continue; }
    if (isPluralOfUsed(k)) { dynamicKept.push(k); continue; }
    orphans.push(k);
  }
  report[locale] = { total: keys.length, orphans, dynamicKept };
  totalOrphans = Math.max(totalOrphans, orphans.length);

  console.log(`\n── ${locale} ──`);
  console.log(`  total: ${keys.length}   static-used: ${keys.filter(k => staticKeys.has(k)).length}   dynamic-kept: ${dynamicKept.length}   ORPHAN: ${orphans.length}`);
  if (orphans.length && !PURGE) {
    console.log(`  (first 30 orphans)`);
    for (const k of orphans.slice(0, 30)) console.log(`    - ${k}`);
    if (orphans.length > 30) console.log(`    ... +${orphans.length - 30} more`);
  }

  if (PURGE && orphans.length) {
    for (const k of orphans) delete json[k];
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
    console.log(`  ✔ purged ${orphans.length} orphan keys from ${path}`);
  }
}

if (!PURGE) {
  console.log(`\n── dynamic prefixes picked up (${dynamicPrefixes.size}) ──`);
  for (const p of [...dynamicPrefixes].sort()) console.log(`  ${p}.*`);
  console.log(`\nRun with --purge to apply the deletion.`);
}

process.exit(0);
