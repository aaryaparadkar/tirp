/**
 * Dashboard repository: SQL and transaction boundaries.
 *
 * All conversation state — status, handling mode, unread counts, conversation
 * intent, audit events, trigger executions — is written here. The webhook path
 * reuses `recordConversationTurn` so every inbound/outbound message belongs to
 * a conversation.
 */

import type { Database } from '../db.js';
import { id, now } from '../lib.js';
import type { ConversationListQuery, ConversationStatus, Intent } from './schemas.js';
import type { ConversationRow, MessageRow, TriggerExecutionRow } from './serializers.js';

/** Use a real transaction when the database supports one, else run inline. */
async function withTransaction<T>(db: Database, fn: (tx: Database) => Promise<T>): Promise<T> {
  return db.transaction ? db.transaction(fn) : fn(db);
}

export interface InsertMessageInput {
  conversationId: string;
  contactId: string;
  direction: 'inbound' | 'outbound';
  body: string;
  messageType?: string;
  channel?: string;
  authorType?: string;
  authorId?: string | null;
  authorName?: string | null;
  intent?: string | null;
  sourceIds?: string[];
  sourceUrls?: Array<{ id: string; title: string; url: string }>;
  llmModel?: string | null;
  llmKeySlot?: number | null;
  latencyMs?: number | null;
  errorCode?: string | null;
  language?: string | null;
  deliveryStatus?: string | null;
  failureNote?: string | null;
  clientTag?: string | null;
  waMessageId?: string | null;
  createdAt?: string;
}

const CONVERSATION_SELECT = `
  SELECT c.id, c.status, c.handling_mode, c.current_intent, c.last_activity_at,
         c.first_message_at, c.message_count, c.unread_count, c.has_error,
         ct.id AS contact_id, ct.name AS contact_name, ct.phone AS contact_phone,
         ct.preferred_language, ct.opted_in,
         m.body AS last_body, m.direction AS last_direction
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    LEFT JOIN LATERAL (
      SELECT body, direction FROM conversation_messages cm
       WHERE cm.conversation_id = c.id
       ORDER BY cm.created_at DESC
       LIMIT 1
    ) m ON TRUE
`;

/** Reuse the newest unresolved conversation for a contact, else create one. */
export async function ensureConversationForContact(
  db: Database,
  contactId: string,
  opts: { at?: string; intent?: string | null } = {},
): Promise<string> {
  const at = opts.at || now();
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM conversations
      WHERE contact_id = $1 AND status <> 'resolved'
      ORDER BY last_activity_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [contactId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const conversationId = id();
  await db.query(
    `INSERT INTO conversations
       (id, contact_id, status, handling_mode, current_intent, first_message_at, last_activity_at, created_at, updated_at)
     VALUES ($1, $2, 'new', 'ai', $3, $4, $4, $4, $4)`,
    [conversationId, contactId, opts.intent ?? null, at],
  );
  return conversationId;
}

export async function insertConversationMessage(
  db: Database,
  input: InsertMessageInput,
): Promise<{ id: string; created: boolean }> {
  const createdAt = input.createdAt || now();
  const clientTag = input.clientTag || null;
  const result = await db.query<{ id: string }>(
    `INSERT INTO conversation_messages
       (id, conversation_id, contact_id, wa_message_id, direction, message_type, body, intent,
        source_ids, source_urls, llm_model, llm_key_slot, latency_ms, error_code, language,
        channel, author_type, author_id, author_name, client_tag, delivery_status, failure_note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT (conversation_id, client_tag) WHERE client_tag IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      id(),
      input.conversationId,
      input.contactId,
      input.waMessageId ?? null,
      input.direction,
      input.messageType || 'text',
      (input.body || '').slice(0, 4000),
      input.intent ?? null,
      JSON.stringify(input.sourceIds || []),
      JSON.stringify(input.sourceUrls || []),
      input.llmModel ?? null,
      typeof input.llmKeySlot === 'number' ? input.llmKeySlot : null,
      typeof input.latencyMs === 'number' ? input.latencyMs : null,
      input.errorCode ?? null,
      input.language ?? null,
      input.channel ?? (input.direction === 'inbound' ? 'contact' : 'assistant'),
      input.authorType ?? (input.direction === 'inbound' ? 'contact' : 'assistant'),
      input.authorId ?? null,
      input.authorName ?? null,
      clientTag,
      input.deliveryStatus ?? null,
      input.failureNote ?? null,
      createdAt,
    ],
  );
  if (!result.rows[0]) {
    // Idempotent replay of an operator reply with the same client tag.
    const existing = await db.query<{ id: string }>(
      'SELECT id FROM conversation_messages WHERE conversation_id = $1 AND client_tag = $2',
      [input.conversationId, clientTag],
    );
    return { id: existing.rows[0]?.id ?? '', created: false };
  }
  const messageId = result.rows[0].id;
  await touchConversation(db, input, createdAt, messageId);
  return { id: messageId, created: true };
}

async function touchConversation(
  db: Database,
  input: InsertMessageInput,
  createdAt: string,
  messageId: string,
): Promise<void> {
  await db.query(
    `UPDATE conversations SET
        last_activity_at = GREATEST(last_activity_at, $2),
        first_message_at = COALESCE(first_message_at, $2),
        last_message_id = $3,
        message_count = message_count + 1,
        unread_count = unread_count + CASE WHEN $4 = 'inbound' THEN 1 ELSE 0 END,
        has_error = has_error OR $5,
        current_intent = COALESCE(current_intent, $6),
        original_intent = COALESCE(original_intent, $6),
        status = CASE WHEN status = 'new' AND $4 = 'outbound' THEN 'in_progress' ELSE status END,
        updated_at = $2
      WHERE id = $1`,
    [
      input.conversationId,
      createdAt,
      messageId,
      input.direction,
      Boolean(input.errorCode),
      input.intent ?? null,
    ],
  ).catch(() => undefined);
}

/** Webhook helper: resolve the conversation then append the turn. */
export async function recordConversationTurn(
  db: Database,
  input: Omit<InsertMessageInput, 'conversationId'>,
): Promise<{ id: string; conversationId: string }> {
  const conversationId = await ensureConversationForContact(db, input.contactId, {
    at: input.createdAt,
    intent: input.intent ?? null,
  });
  const inserted = await insertConversationMessage(db, { ...input, conversationId });
  return { id: inserted.id, conversationId };
}

export async function getConversation(db: Database, conversationId: string): Promise<ConversationRow | null> {
  const result = await db.query<ConversationRow>(`${CONVERSATION_SELECT} WHERE c.id = $1`, [conversationId]);
  return result.rows[0] ?? null;
}

export async function getConversationMessages(db: Database, conversationId: string): Promise<MessageRow[]> {
  const result = await db.query<MessageRow>(
    `SELECT id, conversation_id, direction, message_type, channel, author_type, author_name, body,
            intent, source_ids, source_urls, llm_model, latency_ms, delivery_status, failure_note,
            error_code, created_at
       FROM conversation_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
    [conversationId],
  );
  return result.rows;
}

export async function getMessageById(db: Database, messageId: string): Promise<MessageRow | null> {
  const result = await db.query<MessageRow>(
    `SELECT id, conversation_id, direction, message_type, channel, author_type, author_name, body,
            intent, source_ids, source_urls, llm_model, latency_ms, delivery_status, failure_note,
            error_code, created_at
       FROM conversation_messages WHERE id = $1`,
    [messageId],
  );
  return result.rows[0] ?? null;
}

export async function updateMessageDelivery(
  db: Database,
  messageId: string,
  deliveryStatus: string,
  failureNote: string | null,
): Promise<void> {
  await db.query(
    `UPDATE conversation_messages
        SET delivery_status = $2,
            failure_note = $3,
            delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END
      WHERE id = $1`,
    [messageId, deliveryStatus, failureNote],
  );
}

const SORT_SQL: Record<ConversationListQuery['sort'], string> = {
  recent: 'c.last_activity_at DESC NULLS LAST, c.created_at DESC',
  oldest: 'c.last_activity_at ASC NULLS LAST, c.created_at ASC',
  unread: 'c.unread_count DESC, c.last_activity_at DESC NULLS LAST',
  idle: 'c.last_activity_at ASC NULLS LAST',
};

export async function listConversations(
  db: Database,
  query: ConversationListQuery,
  opts: { fromIso: string },
): Promise<{ rows: ConversationRow[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  conditions.push(`c.last_activity_at >= $${values.push(opts.fromIso)}`);
  if (query.status !== 'all') conditions.push(`c.status = $${values.push(query.status)}`);
  if (query.intent !== 'all') conditions.push(`c.current_intent = $${values.push(query.intent)}`);
  if (query.handling !== 'all') conditions.push(`c.handling_mode = $${values.push(query.handling)}`);
  if (query.language !== 'all') conditions.push(`ct.preferred_language = $${values.push(query.language)}`);
  if (query.hasError === 'with-error') conditions.push('c.has_error = TRUE');
  if (query.direction !== 'all') {
    conditions.push(`m.direction = $${values.push(query.direction)}`);
  }
  const search = query.search.trim();
  if (search) {
    const like = `%${search.replace(/[%_]/g, (match) => `\\${match}`)}%`;
    const placeholder = `$${values.push(like)}`;
    conditions.push(`(ct.name ILIKE ${placeholder} OR ct.phone ILIKE ${placeholder} OR m.body ILIKE ${placeholder})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.pageSize;

  const countResult = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       LEFT JOIN LATERAL (
         SELECT body, direction FROM conversation_messages cm
          WHERE cm.conversation_id = c.id
          ORDER BY cm.created_at DESC
          LIMIT 1
       ) m ON TRUE
       ${where}`,
    values,
  );

  const dataResult = await db.query<ConversationRow>(
    `${CONVERSATION_SELECT}
     ${where}
     ORDER BY ${SORT_SQL[query.sort]}
     LIMIT $${values.push(query.pageSize)} OFFSET $${values.push(offset)}`,
    values,
  );

  return { rows: dataResult.rows, total: Number(countResult.rows[0]?.count || 0) };
}

export type ConversationEventInput = {
  conversationId: string;
  eventType: string;
  actorType: 'operator' | 'system' | 'contact' | 'assistant';
  actorId?: string | null;
  previousValue?: unknown;
  nextValue?: unknown;
  note?: string | null;
};

export async function insertConversationEvent(
  db: Database,
  event: ConversationEventInput,
): Promise<void> {
  await db.query(
    `INSERT INTO conversation_events
       (id, conversation_id, event_type, actor_type, actor_id, previous_value, next_value, note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id(),
      event.conversationId,
      event.eventType,
      event.actorType,
      event.actorId ?? null,
      event.previousValue === undefined ? null : JSON.stringify(event.previousValue),
      event.nextValue === undefined ? null : JSON.stringify(event.nextValue),
      event.note ?? null,
      now(),
    ],
  );
}

export async function updateConversationStatus(
  db: Database,
  conversationId: string,
  next: ConversationStatus,
  actor: { id: string; type: 'operator' },
): Promise<void> {
  await withTransaction(db, async (tx) => {
    const current = await tx.query<{ status: ConversationStatus }>(
      'SELECT status FROM conversations WHERE id = $1 FOR UPDATE',
      [conversationId],
    );
    if (!current.rows[0]) return;
    const previous = current.rows[0].status;
    await tx.query(
      `UPDATE conversations
          SET status = $2,
              resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $1`,
      [conversationId, next],
    );
    await insertConversationEvent(tx, {
      conversationId,
      eventType: 'status_changed',
      actorType: actor.type,
      actorId: actor.id,
      previousValue: { status: previous },
      nextValue: { status: next },
    });
  });
}

export async function updateConversationIntent(
  db: Database,
  conversationId: string,
  next: Intent,
  actor: { id: string },
): Promise<void> {
  await withTransaction(db, async (tx) => {
    const current = await tx.query<{ current_intent: string | null; original_intent: string | null }>(
      'SELECT current_intent, original_intent FROM conversations WHERE id = $1 FOR UPDATE',
      [conversationId],
    );
    if (!current.rows[0]) return;
    const previous = current.rows[0].current_intent;
    const original = current.rows[0].original_intent ?? previous ?? next;
    await tx.query(
      `UPDATE conversations
          SET current_intent = $2,
              original_intent = $3,
              intent_changed_by = $4,
              intent_changed_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [conversationId, next, original, actor.id],
    );
    await insertConversationEvent(tx, {
      conversationId,
      eventType: 'intent_changed',
      actorType: 'operator',
      actorId: actor.id,
      previousValue: { intent: previous, originalIntent: original },
      nextValue: { intent: next },
    });
  });
}

export async function escalateConversation(
  db: Database,
  conversationId: string,
  actor: { id: string },
  note: string | null,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    const current = await tx.query<{ handling_mode: string; status: ConversationStatus }>(
      'SELECT handling_mode, status FROM conversations WHERE id = $1 FOR UPDATE',
      [conversationId],
    );
    if (!current.rows[0]) return;
    const previous = current.rows[0];
    const nextStatus: ConversationStatus =
      previous.status === 'resolved' || previous.status === 'failed'
        ? previous.status
        : 'needs_review';
    await tx.query(
      `UPDATE conversations
          SET handling_mode = 'escalated',
              status = $2,
              escalated_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [conversationId, nextStatus],
    );
    await insertConversationEvent(tx, {
      conversationId,
      eventType: 'escalated',
      actorType: 'operator',
      actorId: actor.id,
      previousValue: { handlingMode: previous.handling_mode, status: previous.status },
      nextValue: { handlingMode: 'escalated', status: nextStatus },
      note,
    });
  });
}

/* ------------------------------------------------------ trigger executions */

export interface InsertExecutionInput {
  id: string;
  triggerId: string;
  triggerName: string;
  operatorId: string;
  operatorName: string;
  conversationId?: string | null;
  targetMasked: string | null;
  targetPhoneHash: string | null;
  idempotencyKey: string | null;
  requestJson: unknown;
  startedAt: string;
}

export async function insertTriggerExecution(
  db: Database,
  input: InsertExecutionInput,
): Promise<{ id: string; created: boolean }> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO trigger_executions
       (id, trigger_id, operator_id, conversation_id, target_phone_hash, target_masked, idempotency_key,
        status, request_json, started_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'running',$8,$9,$9)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.id,
      input.triggerId,
      input.operatorId,
      input.conversationId ?? null,
      input.targetPhoneHash,
      input.targetMasked,
      input.idempotencyKey,
      JSON.stringify(input.requestJson ?? {}),
      input.startedAt,
    ],
  );
  if (!result.rows[0]) {
    const existing = await db.query<{ id: string }>(
      'SELECT id FROM trigger_executions WHERE idempotency_key = $1',
      [input.idempotencyKey],
    );
    return { id: existing.rows[0]?.id ?? input.id, created: false };
  }
  return { id: result.rows[0].id, created: true };
}

export async function finishTriggerExecution(
  db: Database,
  executionId: string,
  result: {
    status: 'success' | 'failed' | 'rejected';
    resultJson?: unknown;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs: number;
  },
): Promise<void> {
  await db.query(
    `UPDATE trigger_executions
        SET status = $2,
            result_json = $3,
            error_code = $4,
            error_message = $5,
            duration_ms = $6,
            completed_at = now()
      WHERE id = $1`,
    [
      executionId,
      result.status,
      result.resultJson === undefined ? null : JSON.stringify(result.resultJson),
      result.errorCode ?? null,
      result.errorMessage ?? null,
      result.durationMs,
    ],
  );
}

export async function getTriggerExecution(
  db: Database,
  executionId: string,
): Promise<TriggerExecutionRow | null> {
  const result = await db.query<TriggerExecutionRow>(
    `SELECT e.id, e.trigger_id, NULL AS trigger_name, e.operator_id, o.name AS operator_name,
            e.conversation_id, e.target_masked, e.status, e.result_json, e.error_code, e.error_message,
            e.started_at, e.duration_ms
       FROM trigger_executions e
       LEFT JOIN dashboard_operators o ON o.id = e.operator_id
      WHERE e.id = $1`,
    [executionId],
  );
  return result.rows[0] ?? null;
}

export async function listTriggerExecutions(
  db: Database,
  query: { page: number; pageSize: number; triggerId?: string; status?: string; conversationId?: string },
): Promise<{ rows: TriggerExecutionRow[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (query.triggerId) conditions.push(`e.trigger_id = $${values.push(query.triggerId)}`);
  if (query.status) conditions.push(`e.status = $${values.push(query.status)}`);
  if (query.conversationId) conditions.push(`e.conversation_id = $${values.push(query.conversationId)}`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.pageSize;

  const total = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM trigger_executions e ${where}`,
    values,
  );
  const rows = await db.query<TriggerExecutionRow>(
    `SELECT e.id, e.trigger_id, NULL AS trigger_name, e.operator_id, o.name AS operator_name,
            e.conversation_id, e.target_masked, e.status, e.result_json, e.error_code, e.error_message,
            e.started_at, e.duration_ms
       FROM trigger_executions e
       LEFT JOIN dashboard_operators o ON o.id = e.operator_id
       ${where}
      ORDER BY e.started_at DESC
      LIMIT $${values.push(query.pageSize)} OFFSET $${values.push(offset)}`,
    values,
  );
  return { rows: rows.rows, total: Number(total.rows[0]?.count || 0) };
}
