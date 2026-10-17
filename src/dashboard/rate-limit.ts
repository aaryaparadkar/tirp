/**
 * Shared (multi-instance) rate limiting for dashboard endpoints.
 *
 * The Phase 3 plan replaces the single-node in-memory limiter with a shared
 * store. This uses a fixed-window counter in PostgreSQL, which is sufficient
 * for the low operator volume of the console. If the shared store is
 * unavailable (or a caller runs against a stubbed database), it degrades to
 * the in-memory limiter rather than failing the request.
 */

import type { Database } from '../db.js';
import { checkRateLimit } from '../rate-limit.js';

export interface SharedRateLimitOptions {
  windowMs?: number;
  max?: number;
}

export interface SharedRateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

function fallback(key: string, opts: SharedRateLimitOptions): SharedRateLimitResult {
  const windowMs = opts.windowMs ?? 60_000;
  const allowed = checkRateLimit(key, { windowMs, max: opts.max });
  return { allowed, retryAfterSec: allowed ? 0 : Math.ceil(windowMs / 1000) };
}

export async function checkSharedRateLimit(
  db: Database,
  key: string,
  opts: SharedRateLimitOptions = {},
): Promise<SharedRateLimitResult> {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 60;
  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  try {
    const result = await db.query<{ hits: number; window_start: string }>(
      `INSERT INTO dashboard_rate_limits (key, window_start, hits)
       VALUES ($1, $2, 1)
       ON CONFLICT (key, window_start) DO UPDATE
         SET hits = dashboard_rate_limits.hits + 1
       RETURNING hits, window_start`,
      [key, new Date(windowStartMs).toISOString()],
    );
    const hits = result.rows[0]?.hits;
    // A real database always returns the row; a stub may not.
    if (typeof hits !== 'number') return fallback(key, opts);
    if (hits === 1) {
      // New window: opportunistically drop stale windows for this key only.
      void db
        .query('DELETE FROM dashboard_rate_limits WHERE window_start < $1', [
          new Date(windowStartMs - windowMs * 2).toISOString(),
        ])
        .catch(() => undefined);
    }
    if (hits > max) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((windowStartMs + windowMs - nowMs) / 1000),
      );
      return { allowed: false, retryAfterSec };
    }
    return { allowed: true, retryAfterSec: 0 };
  } catch {
    return fallback(key, opts);
  }
}

/** Stable key builder; never include raw phone numbers in the key. */
export function rateLimitKey(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(':');
}
