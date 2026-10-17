/**
 * Shared dashboard error shape.
 *
 * Every `/dashboard/*` response that fails returns:
 *
 * ```json
 * { "error": { "code": "…", "message": "…", "status": 429 } }
 * ```
 *
 * Operator-facing messages never include SQL, stack traces, provider bodies,
 * API keys, raw phone numbers, or unrelated message bodies.
 */

import { errorMessage, json } from '../lib.js';

export type DashboardErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'unsupported'
  | 'unavailable'
  | 'network'
  | 'internal';

const ERROR_STATUS: Record<DashboardErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  rate_limited: 429,
  unsupported: 501,
  unavailable: 503,
  network: 502,
  internal: 500,
};

export class DashboardError extends Error {
  readonly code: DashboardErrorCode;
  readonly status: number;
  readonly retryAfterSec?: number;
  /** Extra payload merged into the error body (e.g. a failed message record). */
  readonly details?: Record<string, unknown>;

  constructor(init: {
    code: DashboardErrorCode;
    message: string;
    status?: number;
    retryAfterSec?: number;
    details?: Record<string, unknown>;
  }) {
    super(init.message);
    this.name = 'DashboardError';
    this.code = init.code;
    this.status = init.status ?? ERROR_STATUS[init.code];
    this.retryAfterSec = init.retryAfterSec;
    this.details = init.details;
  }
}

export function isDashboardError(value: unknown): value is DashboardError {
  return value instanceof DashboardError;
}

/** Wrap anything thrown into a safe response without leaking internals. */
export function dashboardErrorResponse(error: unknown): Response {
  if (isDashboardError(error)) {
    const body: Record<string, unknown> = {
      error: {
        code: error.code,
        message: error.message,
        status: error.status,
        ...(error.retryAfterSec ? { retry_after: error.retryAfterSec } : {}),
      },
    };
    if (error.details) Object.assign(body, error.details);
    const headers: Record<string, string> = {};
    if (error.retryAfterSec) headers['retry-after'] = String(error.retryAfterSec);
    if (error.code === 'internal' || error.code === 'unavailable' || error.code === 'network') {
      // Keep the cause server-side only; the operator sees the safe message.
      console.error('[dashboard]', error.code, error.message);
    }
    return json(body, error.status, headers);
  }
  console.error('[dashboard] unhandled error', errorMessage(error));
  return json(
    { error: { code: 'internal', message: 'The dashboard request could not be completed.', status: 500 } },
    500,
  );
}
