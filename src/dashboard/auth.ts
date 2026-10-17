/**
 * Dashboard authentication and authorization.
 *
 * Model: operator session (the recommended option in the Phase 3 plan).
 * A login creates a short-lived server-side session; the browser holds an
 * opaque `HttpOnly`, `SameSite=Lax` cookie. Cookie-authenticated mutations
 * require a CSRF token minted with the session. No provider secret, machine
 * token, or raw credential ever reaches the browser.
 */

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Database } from '../db.js';
import { id, now } from '../lib.js';
import { DashboardError } from './errors.js';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = 'tirp_dashboard_session';
const SESSION_TTL_MS = Number(process.env.DASHBOARD_SESSION_TTL_MS || 12 * 60 * 60 * 1000);

export type OperatorRole = 'viewer' | 'operator' | 'supervisor' | 'admin';

export interface Operator {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
}

export interface AuthContext {
  operator: Operator;
  session: { id: string; csrfToken: string; expiresAt: string };
}

/* ------------------------------------------------------------- permissions */

export type Permission =
  | 'overview.read'
  | 'conversation.read'
  | 'conversation.reply'
  | 'conversation.status'
  | 'conversation.escalate'
  | 'conversation.intent'
  | 'trigger.run'
  | 'execution.read'
  | 'trigger.manage';

const READ_PERMISSIONS: Permission[] = [
  'overview.read',
  'conversation.read',
  'execution.read',
];

const MATRIX: Record<OperatorRole, Permission[]> = {
  viewer: [...READ_PERMISSIONS],
  operator: [
    ...READ_PERMISSIONS,
    'conversation.reply',
    'conversation.status',
    'conversation.escalate',
    'conversation.intent',
    'trigger.run',
  ],
  supervisor: [
    ...READ_PERMISSIONS,
    'conversation.reply',
    'conversation.status',
    'conversation.escalate',
    'conversation.intent',
    'trigger.run',
  ],
  admin: [
    ...READ_PERMISSIONS,
    'conversation.reply',
    'conversation.status',
    'conversation.escalate',
    'conversation.intent',
    'trigger.run',
    'trigger.manage',
  ],
};

export function can(role: OperatorRole, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

/* --------------------------------------------------------------- passwords */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = (stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/* ---------------------------------------------------------------- sessions */

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieSecure(): boolean {
  return process.env.DASHBOARD_COOKIE_SECURE !== 'false';
}

function cookieAttributes(maxAgeSeconds: number): string {
  const parts = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (cookieSecure()) parts.push('Secure');
  return parts.join('; ');
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie');
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const chunk of header.split(';')) {
    const index = chunk.indexOf('=');
    if (index < 0) continue;
    out[chunk.slice(0, index).trim()] = decodeURIComponent(chunk.slice(index + 1).trim());
  }
  return out;
}

interface SessionRow {
  id: string;
  operator_id: string;
  csrf_token: string;
  expires_at: string;
  email: string;
  name: string;
  role: OperatorRole;
  active: boolean;
}

export async function createSession(
  db: Database,
  operatorId: string,
): Promise<{ token: string; csrfToken: string; expiresAt: string }> {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.query(
    `INSERT INTO dashboard_sessions (id, operator_id, token_hash, csrf_token, created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $5, $6)`,
    [id(), operatorId, hashToken(token), csrfToken, now(), expiresAt],
  );
  return { token, csrfToken, expiresAt };
}

export async function destroySession(db: Database, token: string): Promise<void> {
  await db.query('DELETE FROM dashboard_sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function purgeExpiredSessions(db: Database): Promise<void> {
  await db.query('DELETE FROM dashboard_sessions WHERE expires_at < now()').catch(() => undefined);
}

/**
 * Resolve the operator for a request's session cookie. Returns null when the
 * session is missing, expired, or the operator is deactivated.
 */
export async function authenticate(request: Request, db: Database): Promise<AuthContext | null> {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const result = await db.query<SessionRow>(
    `SELECT s.id, s.operator_id, s.csrf_token, s.expires_at, o.email, o.name, o.role, o.active
       FROM dashboard_sessions s
       JOIN dashboard_operators o ON o.id = s.operator_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row || !row.active) return null;
  // Sliding last-seen is best-effort bookkeeping.
  void db
    .query('UPDATE dashboard_sessions SET last_seen_at = $1 WHERE id = $2', [now(), row.id])
    .catch(() => undefined);
  return {
    operator: { id: row.operator_id, email: row.email, name: row.name, role: row.role },
    session: { id: row.id, csrfToken: row.csrf_token, expiresAt: new Date(row.expires_at).toISOString() },
  };
}

export async function requireAuth(request: Request, db: Database): Promise<AuthContext> {
  const auth = await authenticate(request, db);
  if (!auth) {
    throw new DashboardError({
      code: 'unauthorized',
      message: 'Sign in to the dashboard to continue.',
    });
  }
  return auth;
}

export function requirePermission(auth: AuthContext, permission: Permission): void {
  if (!can(auth.operator.role, permission)) {
    throw new DashboardError({
      code: 'forbidden',
      message: 'Your role does not permit this action.',
    });
  }
}

function allowedOrigins(): string[] {
  return (process.env.DASHBOARD_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Validate Origin/Referer for cookie-authenticated mutations. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const target = origin || request.headers.get('referer');
  if (!target) return; // Non-browser clients without Origin are still CSRF-gated below.
  const allowed = allowedOrigins();
  if (allowed.length === 0) return;
  let host: string;
  try {
    host = new URL(target).origin;
  } catch {
    throw new DashboardError({ code: 'forbidden', message: 'The request origin is not allowed.' });
  }
  if (!allowed.includes(host)) {
    throw new DashboardError({ code: 'forbidden', message: 'The request origin is not allowed.' });
  }
}

export function assertCsrf(request: Request, auth: AuthContext): void {
  const header = request.headers.get('x-csrf-token');
  const provided = Buffer.from(header || '');
  const expected = Buffer.from(auth.session.csrfToken);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new DashboardError({
      code: 'forbidden',
      message: 'The request could not be verified. Refresh the dashboard and try again.',
    });
  }
}

/* ------------------------------------------------------------------ routes */

function publicOperator(operator: Operator): Operator {
  return { id: operator.id, email: operator.email, name: operator.name, role: operator.role };
}

interface OperatorRow {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
  password_hash: string;
  active: boolean;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function handleLogin(request: Request, db: Database): Promise<Response> {
  assertSameOrigin(request);
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    throw new DashboardError({ code: 'validation', message: 'The request body must be valid JSON.' });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    throw new DashboardError({
      code: 'validation',
      message: 'Enter both an email and a password.',
    });
  }
  const result = await db.query<OperatorRow>(
    'SELECT id, email, name, role, password_hash, active FROM dashboard_operators WHERE lower(email) = $1',
    [email],
  );
  const row = result.rows[0];
  const valid = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !row.active || !valid) {
    throw new DashboardError({
      code: 'unauthorized',
      message: 'Those credentials were not accepted.',
    });
  }
  await purgeExpiredSessions(db);
  const session = await createSession(db, row.id);
  const operator = publicOperator({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  });
  return new Response(
    JSON.stringify({
      operator,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'set-cookie': `${SESSION_COOKIE}=${encodeURIComponent(session.token)}; ${cookieAttributes(Math.floor(SESSION_TTL_MS / 1000))}`,
      },
    },
  );
}

export function handleLogoutCookie(): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(0)}`;
}

export async function handleSession(request: Request, db: Database): Promise<Response> {
  const auth = await requireAuth(request, db);
  return new Response(
    JSON.stringify({
      operator: publicOperator(auth.operator),
      csrfToken: auth.session.csrfToken,
      expiresAt: auth.session.expiresAt,
    }),
    { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
  );
}

export async function handleLogout(request: Request, db: Database): Promise<Response> {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) await destroySession(db, token).catch(() => undefined);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'set-cookie': handleLogoutCookie(),
    },
  });
}

/**
 * Create or refresh the single operator described by env config so a fresh
 * deployment can be signed into without an out-of-band admin API.
 */
export async function ensureBootstrapOperator(db: Database): Promise<void> {
  const email = (process.env.DASHBOARD_OPERATOR_EMAIL || '').trim().toLowerCase();
  const password = process.env.DASHBOARD_OPERATOR_PASSWORD || '';
  if (!email || !password) return;
  const name = (process.env.DASHBOARD_OPERATOR_NAME || 'Dashboard Operator').trim();
  const role = (process.env.DASHBOARD_OPERATOR_ROLE || 'admin') as OperatorRole;
  const validRole: OperatorRole = (['viewer', 'operator', 'supervisor', 'admin'] as const).includes(role)
    ? role
    : 'operator';
  const passwordHash = await hashPassword(password);
  await db.query(
    `INSERT INTO dashboard_operators (id, email, name, role, password_hash, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6)
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           role = EXCLUDED.role,
           password_hash = EXCLUDED.password_hash,
           active = TRUE,
           updated_at = EXCLUDED.updated_at`,
    [id(), email, name, validRole, passwordHash, now()],
  );
}
