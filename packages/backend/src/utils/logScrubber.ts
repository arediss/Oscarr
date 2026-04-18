/**
 * Scrub secrets from plugin log messages before they land in the PluginLog DB
 * table (which the admin UI exposes). Covers common accidental leaks — a plugin
 * author logging `ctx.log.info('fetched ' + url)` with an api-key in the URL,
 * or `ctx.log.info(JSON.stringify(config))`.
 *
 * Matches are replaced in place with `[REDACTED]`, keeping the surrounding key
 * name so the log stays readable for debugging ("apiKey=[REDACTED]" not "=[REDACTED]").
 *
 * This is a defence-in-depth layer, not a guarantee. A plugin can always
 * concatenate chars or base64 a secret to bypass it. The goal is to catch
 * 95% of accidents, not stop a determined malicious author (that's what the
 * capability system in L3 is for).
 */

// Rule order matters — more-specific patterns run first so the generic key-value
// catch-all doesn't partially consume a string and prevent the specific rule from firing.
// Example: `Authorization: Bearer <jwt>`. If key-value runs first, it captures the word
// `Bearer` as the value of `Authorization:` and the jwt/bearer-header rules never see
// the token on the other side. Specific first = redaction of the actual secret.
const RULES: Array<{ name: string; regex: RegExp; replace: string }> = [
  // JWT-like tokens (eyJxxx.eyJxxx.xxx) — 3 base64url chunks, first starting with eyJ
  {
    name: 'jwt',
    regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replace: '[REDACTED_JWT]',
  },
  // Bearer authorization header values (must run before key-value-pairs)
  {
    name: 'bearer-header',
    regex: /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
    replace: '$1[REDACTED]',
  },
  // Plex-specific: X-Plex-Token=... in query strings or headers
  {
    name: 'plex-token-qs',
    regex: /(X-Plex-Token\s*=\s*)([^\s&]+)/gi,
    replace: '$1[REDACTED]',
  },
  // key=value / key:value / "key": "value" shapes — covers query strings, JSON, YAML-like. We keep the
  // key+separator (including any opening quote on the value) and swap the value for [REDACTED]; the
  // forbidden-char set stops the capture at the next delimiter so we don't eat the rest of the payload.
  {
    name: 'key-value-pairs',
    regex: /((?:api[_-]?key|apikey|token|password|pass|secret|auth(?:orization)?)["']?\s*[=:]\s*["']?)([^\s"',&;}\])[]+)/gi,
    replace: '$1[REDACTED]',
  },
];

export function scrubSecrets(input: string): string {
  if (!input) return input;
  let out = input;
  for (const rule of RULES) out = out.replace(rule.regex, rule.replace);
  return out;
}
