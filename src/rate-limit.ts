/**
 * Minimal in-memory sliding-window rate limiter for low-volume operator
 * endpoints (e.g. quiz triggers). Single-node only; for multi-instance
 * deployments replace with a shared store.
 */

const buckets = new Map<string, number[]>();

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  now?: number;
}

/** Returns true when the request is allowed (and records it). */
export function checkRateLimit(key: string, opts: RateLimitOptions = {}): boolean {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 5;
  const now = opts.now ?? Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) || []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
