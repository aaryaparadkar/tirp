import { createHmac, timingSafeEqual } from 'node:crypto';

export const now = (): string => new Date().toISOString();
export const id = (): string => crypto.randomUUID();

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
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

export function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}
