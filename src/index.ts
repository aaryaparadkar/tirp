import http from 'node:http';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile?.();
} catch {}
import { handleApi } from './api.js';
import { createDatabase, type Database } from './db.js';
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

export async function handleRequest(request: Request, runtime: Runtime): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ ok: true, service: 'oshc-whatsapp-catalogue' });
  if (url.pathname === '/webhooks/kapso' && request.method === 'POST') return handleWebhook(request, runtime.db, runtime.flows);
  const api = await handleApi(request, runtime.db, url.pathname);
  return api || json({ error: 'Not found' }, 404);
}

export async function start(): Promise<http.Server> {
  const runtime = createRuntime();
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
