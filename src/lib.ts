import { createHmac, timingSafeEqual } from 'node:crypto';

export const now = (): string => new Date().toISOString();
export const id = (): string => crypto.randomUUID();

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function verifyHmac(raw: Buffer, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const actual = Buffer.from(signature.trim().toLowerCase());
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export function isE164(value: unknown): value is string {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * Shared phone normalization for every operator entry point (dashboard
 * triggers, quiz trigger). Tolerates spacing/punctuation and a missing `+`.
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.trim().replace(/[\s\-().]/g, '');
  if (isE164(cleaned)) return cleaned;
  if (/^[1-9]\d{7,14}$/.test(cleaned)) return `+${cleaned}`;
  return null;
}

export function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}
