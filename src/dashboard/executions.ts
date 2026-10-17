/** Trigger execution history, newest first. */

import type { Database } from '../db.js';
import { json } from '../lib.js';
import type { AuthContext } from './auth.js';
import { requirePermission } from './auth.js';
import * as repo from './repository.js';
import { toTriggerExecution } from './serializers.js';

function positiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function listExecutionsHandler(
  request: Request,
  url: URL,
  db: Database,
  auth: AuthContext,
): Promise<Response> {
  requirePermission(auth, 'execution.read');
  const page = positiveInt(url.searchParams.get('page'), 1);
  const pageSize = Math.min(positiveInt(url.searchParams.get('page_size'), 20), 100);
  const { rows, total } = await repo.listTriggerExecutions(db, {
    page,
    pageSize,
    triggerId: url.searchParams.get('trigger_id') || undefined,
    status: url.searchParams.get('status') || undefined,
    conversationId: url.searchParams.get('conversation_id') || undefined,
  });
  return json({
    data: rows.map(toTriggerExecution),
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
