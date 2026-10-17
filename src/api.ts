import { timingSafeEqual } from 'node:crypto';
import type { Database } from './db.js';
import { json, normalizePhone, readJson } from './lib.js';
import { ensureContact, listCategories, listServices } from './catalogue.js';
import { startQuizForContact } from './quiz/service.js';
import { checkSharedRateLimit, rateLimitKey } from './dashboard/rate-limit.js';

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Timing-safe token comparison that does not leak length via early exit. */
function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handleQuizStart(request: Request, db: Database): Promise<Response> {
  const configured = (process.env.QUIZ_TRIGGER_TOKEN || '').trim();
  if (!configured) {
    console.error('[quiz] QUIZ_TRIGGER_TOKEN is not configured');
    return json({ error: 'Quiz trigger unavailable' }, 503);
  }
  const provided = bearerToken(request);
  if (!provided || !tokensEqual(provided, configured)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  let body: { phone?: unknown };
  try {
    body = await readJson<{ phone?: unknown }>(request);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const phone = normalizePhone(body?.phone);
  if (!phone) {
    return json({ error: 'phone must be an E.164 number like +61400000000' }, 422);
  }
  const rate = await checkSharedRateLimit(db, rateLimitKey('quiz-start', phone), {
    windowMs: 60_000,
    max: 5,
  });
  if (!rate.allowed) {
    return json({ error: 'Rate limit exceeded, try again shortly' }, 429);
  }
  let contact;
  try {
    contact = await ensureContact(db, phone, 'WhatsApp user');
  } catch (error) {
    console.error('[quiz] contact lookup failed', error);
    return json({ error: 'Contact lookup failed' }, 500);
  }
  try {
    const result = await startQuizForContact(db, { id: contact.id, phone: contact.phone });
    return json({
      ok: true,
      phone: contact.phone,
      session: result.sessionNumber,
      resumed: result.resumed,
      delivery: result.delivery,
    });
  } catch (error) {
    console.error('[quiz] trigger failed', error);
    return json({ error: 'Quiz delivery failed' }, 502);
  }
}

export async function handleApi(request: Request, db: Database, path: string): Promise<Response | null> {
  if (request.method === 'GET' && path === '/catalogue/categories') return json({ data: await listCategories(db) });
  if (request.method === 'GET' && path === '/catalogue/services') {
    const categoryId = new URL(request.url).searchParams.get('category_id') || undefined;
    return json({ data: await listServices(db, categoryId) });
  }
  if (request.method === 'POST' && path === '/catalogue/services') {
    const body = await readJson<{ categoryId: string; name: string; description: string; flowName?: string; flowId?: string; actionLabel?: string }>(request);
    if (!body.categoryId || !body.name || !body.description) return json({ error: 'categoryId, name, and description are required' }, 422);
    await db.query('INSERT INTO catalogue_services (id, category_id, name, description, flow_name, flow_id, action_label, active, sort_order, created_at, updated_at) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, true, 0, now(), now())', [body.categoryId, body.name, body.description, body.flowName || null, body.flowId || null, body.actionLabel || null]);
    return json({ ok: true }, 201);
  }
  if (request.method === 'POST' && path === '/quiz/start') return handleQuizStart(request, db);
  return null;
}
