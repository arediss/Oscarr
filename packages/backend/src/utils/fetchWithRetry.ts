/** Retry helper for external HTTP calls (TMDB, *arr, GitHub, web-push, Discord OAuth).
 *
 *  Retries once after a short backoff on transient failures — network errors, timeouts, or
 *  upstream 5xx. NEVER retries 4xx because those are client errors that will fail identically
 *  on a second attempt (invalid input, missing auth, resource not found).
 *
 *  One retry is enough for the 99% case of a brief cloudflare bump or upstream hiccup; more
 *  aggressive retries risk compounding DoS during a real outage. For a queue-style "exponential
 *  backoff until dead" semantic (e.g. failed-request auto-retry), use the scheduler's
 *  `retry_failed_requests` job instead. */

interface RetryOptions {
  /** Ms to wait before the single retry. Default 500ms. */
  backoffMs?: number;
  /** Caller-supplied label used in the warning log when the first attempt fails. */
  label?: string;
}

interface LooseErrorResponse {
  response?: { status?: number };
  /** web-push style — error exposes the HTTP status directly on the error object. */
  statusCode?: number;
  code?: string;
  name?: string;
}

/** True if the error looks transient — worth one retry. Network / DNS / timeout / 5xx. */
export function isRetryable(err: unknown): boolean {
  const e = err as LooseErrorResponse;
  const status = e?.response?.status ?? e?.statusCode;
  if (typeof status === 'number') {
    return status >= 500 && status <= 599;
  }
  // axios / undici / node network codes worth retrying
  const transientCodes = new Set([
    'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN',
    'ENETUNREACH', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
  ]);
  if (e?.code && transientCodes.has(e.code)) return true;
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return true;
  return false;
}

/** Run `fn` once, retry once on a transient failure. Non-transient errors bubble immediately. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { backoffMs = 500, label } = opts;
  try {
    return await fn();
  } catch (err) {
    if (!isRetryable(err)) throw err;
    if (label) {
      // eslint-disable-next-line no-console
      console.warn(`[${label}] retryable failure, retrying in ${backoffMs}ms`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return fn();
  }
}

/** Response interceptor for an axios instance: single retry on transient 5xx / network.
 *  `config.__retried` marker prevents infinite loops if the retry itself also fails. */
export function attachAxiosRetry<I extends {
  interceptors: { response: { use: (a: undefined, b: (err: unknown) => unknown) => number } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: (config: any) => Promise<unknown>;
}>(instance: I, label: string, backoffMs = 500): I {
  instance.interceptors.response.use(undefined, async (err: unknown) => {
    const e = err as { config?: { __retried?: boolean } };
    if (!e.config || e.config.__retried || !isRetryable(err)) throw err;
    e.config.__retried = true;
    // eslint-disable-next-line no-console
    console.warn(`[${label}] retryable failure, retrying in ${backoffMs}ms`, (err as LooseErrorResponse).response?.status ?? (err as LooseErrorResponse).code);
    await new Promise((r) => setTimeout(r, backoffMs));
    return instance.request(e.config);
  });
  return instance;
}
