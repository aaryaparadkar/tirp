/**
 * Dashboard HTTP router.
 *
 * Dispatches `/dashboard/*`, authenticates every non-auth route, verifies
 * Origin and CSRF on mutations, applies a broad per-operator throttle, and
 * serializes failures with the shared error shape. Security headers are
 * applied by the request entry point.
 */

import type { Database } from '../db.js';
import { json } from '../lib.js';
import {
  assertCsrf,
  assertSameOrigin,
  handleLogin,
  handleLogout,
  requireAuth,
  requirePermission,
  type AuthContext,
} from './auth.js';
import { escalateHandler, getConversationHandler, intentHandler, listConversationsHandler, replyHandler, statusHandler } from './conversations.js';
import {
  dashboardErrorResponse,
  DashboardError,
} from './errors.js';
import { listExecutionsHandler } from './executions.js';
import { buildOverview } from './overview.js';
import { checkSharedRateLimit, rateLimitKey } from './rate-limit.js';
import { parseRange } from './schemas.js';
import { listTriggersHandler, runTriggerHandler } from './triggers.js';

type RouteName =
  | 'login'
  | 'logout'
  | 'session'
  | 'overview'
  | 'conversations'
  | 'conversation'
  | 'reply'
  | 'status'
  | 'escalate'
  | 'intent'
  | 'triggers'
  | 'triggerRun'
  | 'executions';

interface RouteMatch {
  name: RouteName;
  params: Record<string, string>;
}

function matchRoute(method: string, pathname: string): RouteMatch | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'dashboard') return null;
  const rest = segments.slice(1);
  if (rest.length === 0) return { name: 'overview', params: {} };

  if (rest[0] === 'auth') {
    if (rest.length === 2 && rest[1] === 'login' && method === 'POST') return { name: 'login', params: {} };
    if (rest.length === 2 && rest[1] === 'logout' && method === 'POST') return { name: 'logout', params: {} };
    if (rest.length === 2 && rest[1] === 'session' && method === 'GET') return { name: 'session', params: {} };
    return null;
  }

  if (rest.length === 1) {
    if (rest[0] === 'overview' && method === 'GET') return { name: 'overview', params: {} };
    if (rest[0] === 'triggers' && method === 'GET') return { name: 'triggers', params: {} };
    if (rest[0] === 'trigger-executions' && method === 'GET') return { name: 'executions', params: {} };
    if (rest[0] === 'conversations' && method === 'GET') return { name: 'conversations', params: {} };
    return null;
  }

  if (rest[0] === 'conversations') {
    const conversationId = decodeURIComponent(rest[1]);
    if (rest.length === 2) {
      if (method === 'GET') return { name: 'conversation', params: { id: conversationId } };
      if (method === 'PATCH') return { name: 'status', params: { id: conversationId } };
    }
    if (rest.length === 3) {
      if (rest[2] === 'reply' && method === 'POST') return { name: 'reply', params: { id: conversationId } };
      if (rest[2] === 'escalate' && method === 'POST') return { name: 'escalate', params: { id: conversationId } };
      if (rest[2] === 'intent' && method === 'PATCH') return { name: 'intent', params: { id: conversationId } };
    }
    return null;
  }

  if (rest[0] === 'triggers' && rest.length === 3 && rest[2] === 'run' && method === 'POST') {
    return { name: 'triggerRun', params: { id: decodeURIComponent(rest[1]) } };
  }

  return null;
}

function allowedOrigins(): string[] {
  return (process.env.DASHBOARD_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  if (!allowedOrigins().includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    'access-control-allow-headers': 'content-type, x-csrf-token',
    vary: 'Origin',
  };
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  if (Object.keys(headers).length === 0) return response;
  const merged = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) merged.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

async function overviewHandler(
  request: Request,
  url: URL,
  db: Database,
  auth: AuthContext,
): Promise<Response> {
  const { requirePermission } = await import('./auth.js');
  requirePermission(auth, 'overview.read');
  const range = parseRange(url.searchParams.get('range'));
  const { overview, etag } = await buildOverview(db, range);
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { etag, 'cache-control': 'private, max-age=30' } });
  }
  return json(overview, 200, { etag, 'cache-control': 'private, max-age=30' });
}

async function dispatch(
  request: Request,
  url: URL,
  db: Database,
  route: RouteMatch,
  auth: AuthContext,
): Promise<Response> {
  switch (route.name) {
    case 'session':
      return json(
        { operator: auth.operator, csrfToken: auth.session.csrfToken, expiresAt: auth.session.expiresAt },
        200,
        { 'cache-control': 'no-store' },
      );
    case 'overview':
      return overviewHandler(request, url, db, auth);
    case 'conversations':
      return listConversationsHandler(request, url, db, auth);
    case 'conversation':
      return getConversationHandler(request, db, auth, route.params.id!);
    case 'reply':
      return replyHandler(request, db, auth, route.params.id!);
    case 'status':
      return statusHandler(request, db, auth, route.params.id!);
    case 'escalate':
      return escalateHandler(request, db, auth, route.params.id!);
    case 'intent':
      return intentHandler(request, db, auth, route.params.id!);
    case 'triggers':
      return listTriggersHandler(request, db, auth);
    case 'triggerRun':
      return runTriggerHandler(request, db, auth, route.params.id!);
    case 'executions':
      return listExecutionsHandler(request, url, db, auth);
    default:
      throw new DashboardError({ code: 'not_found', message: 'Unknown dashboard route.' });
  }
}

export async function handleDashboard(request: Request, db: Database): Promise<Response> {
  const url = new URL(request.url);
  const cors = corsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const route = matchRoute(request.method, url.pathname);
    if (!route) {
      throw new DashboardError({ code: 'not_found', message: 'Unknown dashboard route.' });
    }

    if (route.name === 'login') {
      return withHeaders(await handleLogin(request, db), cors);
    }

    const auth = await requireAuth(request, db);

    if (route.name === 'logout') {
      assertSameOrigin(request);
      assertCsrf(request, auth);
      return withHeaders(await handleLogout(request, db), cors);
    }

    const limit = await checkSharedRateLimit(db, rateLimitKey('dashboard', auth.operator.id), {
      windowMs: 60_000,
      max: 600,
    });
    if (!limit.allowed) {
      throw new DashboardError({
        code: 'rate_limited',
        message: 'The dashboard is receiving requests too quickly. Try again shortly.',
        retryAfterSec: limit.retryAfterSec,
      });
    }

    const mutating = request.method !== 'GET' && request.method !== 'HEAD';
    if (mutating) {
      assertSameOrigin(request);
      assertCsrf(request, auth);
    }

    const response = await dispatch(request, url, db, route, auth);
    return withHeaders(response, cors);
  } catch (error) {
    return withHeaders(dashboardErrorResponse(error), cors);
  }
}
