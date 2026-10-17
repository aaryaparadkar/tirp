import http from 'node:http';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile?.();
} catch {}
import { handleApi } from './api.js';
import { createDatabase, type Database } from './db.js';
import { ensureBootstrapOperator } from './dashboard/auth.js';
import { handleDashboard } from './dashboard/router.js';
import { FlowRegistry } from './flows.js';
import { json } from './lib.js';
import { handleWebhook } from './webhook.js';
import { OshcServiceFlow } from './oshc-flow.js';
import { OshcQuizFlow } from './quiz/flow.js';
import { sendWeeklyQuizReminders } from './quiz/service.js';

export interface Runtime {
  db: Database;
  flows: FlowRegistry;
}

export function createRuntime(db: Database = createDatabase()): Runtime {
  const flows = new FlowRegistry();
  flows.register(new OshcServiceFlow(db));
  flows.register(new OshcQuizFlow(db));
  return { db, flows };
}

/**
 * Response headers applied to every route. The API answers with JSON only, so
 * a locked-down policy is safe and keeps operator content out of frames and
 * referrers.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleRequest(request: Request, runtime: Runtime): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health') return withSecurityHeaders(json({ ok: true, service: 'oshc-whatsapp-catalogue' }));
  if (url.pathname === '/webhooks/kapso' && request.method === 'POST') {
    return withSecurityHeaders(await handleWebhook(request, runtime.db, runtime.flows));
  }
  if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
    return withSecurityHeaders(await handleDashboard(request, runtime.db));
  }
  const api = await handleApi(request, runtime.db, url.pathname);
  return withSecurityHeaders(api || json({ error: 'Not found' }, 404));
}

export async function start(): Promise<http.Server> {
  const runtime = createRuntime();
  void ensureBootstrapOperator(runtime.db).catch((error) =>
    console.error('[dashboard] bootstrap operator failed', error),
  );
  const sendReminders = (): void => { void sendWeeklyQuizReminders(runtime.db).catch((error) => console.error('Weekly quiz reminders failed', error)); };
  sendReminders();
  const reminderTimer = setInterval(sendReminders, 60 * 60 * 1000);
  reminderTimer.unref();
  const server = http.createServer(async (req, res) => {
    try {
      const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : req as unknown as BodyInit, duplex: 'half' } as RequestInit);
      const response = await handleRequest(request, runtime);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
  server.listen(Number(process.env.PORT || 3000), () => console.log(`OSHC catalogue listening on ${process.env.PORT || 3000}`));
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await start();
