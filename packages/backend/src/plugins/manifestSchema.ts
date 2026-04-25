import { z } from 'zod';
import { isVersionSupported, getSupportedVersions } from './context/index.js';
import { ALL_CAPABILITIES } from './types.js';

// Path guard for `entry` / `frontend`: no traversal, no absolute paths.
// `manifest.json` lives at `<pluginDir>/manifest.json`; these fields must resolve inside `<pluginDir>`.
const relativePath = z.string().refine(
  (v) => {
    const normalized = v.replace(/\\/g, '/');
    return !normalized.startsWith('..') && !normalized.includes('/../') && !normalized.startsWith('/');
  },
  { message: 'path traversal or absolute path not allowed' }
);

const apiVersion = z.string().refine(isVersionSupported, {
  message: `unsupported apiVersion (supported: ${getSupportedVersions().join(', ')})`,
});

const settingDef = z.object({
  key: z.string().min(1),
  label: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'password']),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  description: z.string().optional(),
}).strict();

const jobDef = z.object({
  key: z.string().min(1),
  label: z.string(),
  cron: z.string().min(1),
}).strict();

const sizeSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
}).strict();

const dashboardWidgetPropsSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'must be lowercase alphanumeric + dashes'),
  title: z.string().min(1),
  icon: z.string().optional(),                    // Lucide icon name
  defaultSize: sizeSchema,
  minSize: sizeSchema.optional(),
  maxSize: sizeSchema.optional(),
}).strict();

const uiContribution = z.object({
  hookPoint: z.string().min(1),
  props: z.record(z.unknown()),
  order: z.number().optional(),
}).strict().superRefine((data, ctx) => {
  // For the dashboard widget hook, validate props with the dedicated schema so a malformed
  // contribution is rejected at plugin load instead of crashing the dashboard at render.
  if (data.hookPoint === 'admin.dashboard.widget') {
    const result = dashboardWidgetPropsSchema.safeParse(data.props);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['props', ...issue.path],
          message: issue.message,
        });
      }
    }
  }
});

const routesDef = z.object({
  prefix: z.string().min(1).startsWith('/'),
}).strict();

const hooks = z.object({
  routes: routesDef.optional(),
  jobs: z.array(jobDef).optional(),
  ui: z.array(uiContribution).optional(),
  features: z.record(z.boolean()).optional(),
}).strict();

const capabilityEnum = z.enum(ALL_CAPABILITIES as unknown as [string, ...string[]]);

const pluginManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'must be lowercase alphanumeric + dashes'),
  name: z.string().min(1),
  version: z.string().min(1),
  apiVersion,
  description: z.string().optional(),
  author: z.string().optional(),
  entry: relativePath,
  frontend: relativePath.optional(),
  engines: z.object({
    oscarr: z.string().min(1),
    testedAgainst: z.array(z.string().min(1)).optional(),
  }).strict().optional(),
  services: z.array(z.string().min(1)).optional(),
  capabilities: z.array(capabilityEnum).optional(),
  capabilityReasons: z.record(capabilityEnum, z.string()).optional(),
  settings: z.array(settingDef).optional(),
  hooks: hooks.optional(),
}).strict();

type ParsedManifest = z.infer<typeof pluginManifestSchema>;

/** Parse + validate a manifest. Throws with a readable error including the field path on failure. */
export function parseManifest(data: unknown, dir: string): ParsedManifest {
  const result = pluginManifestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      const path = i.path.length > 0 ? i.path.join('.') : '<root>';
      return `  ${path}: ${i.message}`;
    }).join('\n');
    throw new Error(`Invalid manifest in ${dir}:\n${issues}`);
  }
  return result.data;
}
