import type { Database } from './db.js';
import { json, readJson } from './lib.js';
import { listCategories, listServices } from './catalogue.js';

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
  return null;
}
