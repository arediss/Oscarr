import { prisma } from './prisma.js';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/** Strip newlines/tabs from single-line fields to prevent log injection. Stack traces keep
 *  their newlines — they're appended to `message` inside a clearly-bounded block. */
function sanitizeLine(input: string): string {
  return input.replace(/[\r\n\t]/g, ' ');
}

/** Redact the stack so "at …/<hostdir>/app/…" becomes "at <app>/…" — avoids shipping the op's
 *  home path when they copy-share a log entry. */
function redactStack(stack: string): string {
  return stack
    .split('\n')
    .map((line) => line.replace(/(\s+at\s+(?:[^(]+\()?)[^\s()]*?(\/packages\/[^)\s]+)/, '$1<app>$2'))
    .join('\n');
}

export async function logEvent(level: LogLevel, label: string, message: string, err?: unknown) {
  // Sanitize label at entry so every downstream consumer (DB row, stdout, stderr) sees the
  // stripped form — blocks CRLF injection into the log stream.
  const safeLabel = sanitizeLine(label);
  let body = sanitizeLine(message);
  if (err instanceof Error && err.stack) {
    body += `\n---\n${redactStack(err.stack)}`;
  } else if (err != null) {
    body += `\n---\n${sanitizeLine(String(err))}`;
  }
  if (level === 'debug') {
    // Pass body as a separate argument — console.log treats its first arg as a format spec,
    // so user-controlled data in the format position could be interpreted as %s/%d tokens.
    console.log(`[${safeLabel}]`, body);
    if (process.env.DEBUG_LOGS !== 'true') return;
  }
  try {
    await prisma.appLog.create({ data: { level, label: safeLabel, message: body } });
  } catch (dbErr) {
    console.error(`[logEvent:${level}] [${safeLabel}]`, body, dbErr);
  }
}
