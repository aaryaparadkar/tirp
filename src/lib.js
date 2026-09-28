export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export function log(level, event, fields = {}) {
  console.log(JSON.stringify({ level, event, at: now(), ...fields }));
}

export async function readJson(request) {
  try { return await request.json(); } catch { throw new Error('Invalid JSON body'); }
}

export function isE164(value) { return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value); }
export function isIsoUtc(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && !Number.isNaN(Date.parse(value)); }
export function isTimezone(value) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return typeof value === 'string'; } catch { return false; }
}
export function enumValue(value, values) { return typeof value === 'string' && values.includes(value); }

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyHmac(raw, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const actual = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const expected = new TextEncoder().encode(signature.trim().toLowerCase());
  const hex = [...actual].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== hex.length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ hex.charCodeAt(i);
  return diff === 0;
}

export function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
