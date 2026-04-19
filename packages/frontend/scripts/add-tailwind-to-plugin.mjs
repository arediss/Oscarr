#!/usr/bin/env node
/**
 * One-shot scaffolder to add Tailwind CSS support to an Oscarr plugin.
 *
 * Drops in a Tailwind config (with the Oscarr design tokens inlined so the plugin stays
 * portable), a CSS entry that only pulls utilities (components come from the core bundle
 * already loaded in the page), patches build.js to run the Tailwind CLI after esbuild, and
 * adds tailwindcss to the plugin's devDependencies at the same version the core uses.
 *
 * Usage:
 *   node packages/frontend/scripts/add-tailwind-to-plugin.mjs <plugin-dir>
 *
 * The script is idempotent: re-running on a plugin that's already wired is a no-op per step.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_FRONTEND = resolve(__dirname, '..');
const PRESET_SRC = resolve(CORE_FRONTEND, 'tailwind.preset.js');
// Sentinel comment we emit when patching build.js so a re-run reliably detects our own patch
// instead of false-positiving on any unrelated mention of "tailwindcss" in the file.
const BUILD_JS_MARKER = '// ── Tailwind CSS step (added by add-tailwind-to-plugin.mjs)';

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    exit(`Malformed JSON in ${label} (${path}): ${e.message}`);
  }
}

function readCorePackage() {
  const pkg = readJson(resolve(CORE_FRONTEND, 'package.json'), 'core package.json');
  const ver = pkg.dependencies?.tailwindcss || pkg.devDependencies?.tailwindcss;
  if (!ver) exit('Cannot find tailwindcss version in core package.json');
  return ver;
}

function assertPluginDir(dir) {
  if (!existsSync(dir)) exit(`Plugin directory does not exist: ${dir}`);
  for (const f of ['package.json', 'build.js', 'manifest.json']) {
    if (!existsSync(join(dir, f))) exit(`Not a plugin directory (missing ${f}): ${dir}`);
  }
  if (!existsSync(join(dir, 'frontend'))) {
    exit(`Plugin has no frontend/ folder — nothing to style: ${dir}`);
  }
}

function exit(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`  ${msg}`);
}

function addDevDep(pkgPath, name, version) {
  const pkg = readJson(pkgPath, 'plugin package.json');
  pkg.devDependencies = pkg.devDependencies || {};
  if (pkg.devDependencies[name] === version) {
    log(`devDep ${name}@${version} already present`);
    return false;
  }
  pkg.devDependencies[name] = version;
  // Preserve key ordering where possible: alphabetise devDeps for a clean diff.
  const sorted = Object.keys(pkg.devDependencies).sort().reduce((acc, k) => {
    acc[k] = pkg.devDependencies[k];
    return acc;
  }, {});
  pkg.devDependencies = sorted;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  log(`added devDep ${name}@${version}`);
  return true;
}

function writeIfMissing(path, content, label) {
  if (existsSync(path)) {
    log(`${label} already exists at ${path}`);
    return false;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  log(`created ${label}`);
  return true;
}

function patchBuildJs(buildJsPath) {
  const src = readFileSync(buildJsPath, 'utf8');
  if (src.includes(BUILD_JS_MARKER)) {
    log('build.js already patched — skipping (marker found)');
    return false;
  }
  if (src.includes('tailwindcss')) {
    // File mentions tailwindcss but not our sentinel — likely a hand-rolled setup we'd stomp
    // on if we appended blindly. Bail out loudly rather than skip silently.
    exit(`build.js at ${buildJsPath} references tailwindcss but lacks our marker. Patch it manually or remove the existing integration, then re-run this script.`);
  }

  // Append a post-build Tailwind step. Runs the CLI with the plugin's local config, reads the
  // CSS entry we dropped at frontend/index.css, emits to dist/frontend/index.css. Works with
  // both one-shot `npm run build` and watch mode — the CLI supports `--watch` itself.
  const patch = `
${BUILD_JS_MARKER} ─────────────────
import { spawn, spawnSync } from 'child_process';

const tailwindArgs = [
  '-c', resolve(__dirname, 'tailwind.config.js'),
  '-i', resolve(__dirname, 'frontend/index.css'),
  '-o', resolve(__dirname, 'dist/frontend/index.css'),
  ...(watch ? ['--watch'] : ['--minify']),
];

if (watch) {
  // Fire-and-forget in watch mode; the CLI's own watcher owns the lifecycle.
  const child = spawn('npx', ['tailwindcss', ...tailwindArgs], { stdio: 'inherit', cwd: __dirname });
  child.on('exit', (code) => { if (code !== null && code !== 0) process.exit(code); });
} else {
  const result = spawnSync('npx', ['tailwindcss', ...tailwindArgs], { stdio: 'inherit', cwd: __dirname });
  if (result.status !== 0) process.exit(result.status || 1);
  console.log('Frontend (CSS) built → dist/frontend/index.css');
}
`;

  writeFileSync(buildJsPath, src.trimEnd() + '\n' + patch);
  log('patched build.js with Tailwind step');
  return true;
}

function main() {
  const [, , rawDir] = process.argv;
  if (!rawDir) exit('Usage: add-tailwind-to-plugin.mjs <plugin-dir>');
  const pluginDir = resolve(process.cwd(), rawDir);

  assertPluginDir(pluginDir);
  if (!existsSync(PRESET_SRC)) exit(`Missing core preset at ${PRESET_SRC}`);

  console.log(`→ Adding Tailwind to plugin at ${pluginDir}`);

  // 1. Copy the core preset inline — plugins are ~/Oscarr/plugins/* (outside the monorepo),
  //    so we can't require from the core. A copy stays self-contained and travels with the
  //    plugin repo. The preset is Oscarr-owned: re-running this script re-syncs it, which
  //    means a plugin that edits its copy in-place loses those changes. Extend Oscarr's tokens
  //    via the plugin's tailwind.config.js `theme.extend` instead of editing the preset.
  const presetDst = join(pluginDir, 'tailwind.preset.js');
  const presetSrcContent = readFileSync(PRESET_SRC, 'utf8');
  if (existsSync(presetDst) && readFileSync(presetDst, 'utf8') === presetSrcContent) {
    log('tailwind.preset.js already up to date');
  } else {
    if (existsSync(presetDst)) {
      log('tailwind.preset.js differs from core — overwriting (extend via tailwind.config.js, not in-place)');
    } else {
      log('copied tailwind.preset.js into plugin');
    }
    copyFileSync(PRESET_SRC, presetDst);
  }

  // 2. Plugin-local tailwind.config.js that wires the preset and scans the plugin's frontend.
  writeIfMissing(
    join(pluginDir, 'tailwind.config.js'),
    `import preset from './tailwind.preset.js';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./frontend/**/*.{ts,tsx,js,jsx}'],
  // Base + components already ship in the core CSS bundle that Oscarr loads globally — we only
  // need utilities here. Keep this config lean to avoid bloating the plugin's CSS bundle.
  corePlugins: { preflight: false },
  plugins: [],
};
`,
    'tailwind.config.js',
  );

  // 3. CSS entry — utilities only. Components (card, btn-primary, input, …) and the base reset
  //    come from the core bundle; adding them here would duplicate ~15KB per plugin for no gain.
  writeIfMissing(
    join(pluginDir, 'frontend/index.css'),
    `/* Tailwind utilities compiled into the plugin's own CSS bundle. Core ships base + components. */
@tailwind utilities;
`,
    'frontend/index.css',
  );

  // 4. Pin tailwindcss to the core's version so utility syntax matches exactly.
  const coreTailwindVersion = readCorePackage();
  addDevDep(join(pluginDir, 'package.json'), 'tailwindcss', coreTailwindVersion);

  // 5. Extend the plugin's build.js to invoke the Tailwind CLI alongside esbuild.
  patchBuildJs(join(pluginDir, 'build.js'));

  console.log('');
  console.log('✓ Done. Next steps:');
  console.log(`  cd ${pluginDir}`);
  console.log('  npm install       # pulls tailwindcss');
  console.log('  npm run build     # emits dist/frontend/{index.js,index.css}');
  console.log('');
  console.log('  Oscarr\'s plugin loader injects the <link> automatically when your plugin mounts.');
}

main();
