/**
 * Conversation endpoints: list, detail, reply, status, escalation, intent.
 *
 * Reads mask phone numbers through the serializers. Writes validate
 * transitions, are idempotent on `clientTag`, and record audit events. A reply
 * is persisted before delivery so a provider failure returns the stored
 * message (with a safe failure note) instead of losing the operator's words.
 */

import type { Database } from '../db.js';
import { catalogueConfig } from '../config.js';
import { sendText } from '../kapso.js';
import { json, now } from '../lib.js';
import { KB_SOURCES } from '../kb/sources.js';
import type { AuthContext } from './auth.js';
import { requirePermission } from './auth.js';
import { DashboardError } from './errors.js';
import { checkSharedRateLimit, rateLimitKey } from './rate-limit.js';
import * as repo from './repository.js';
import {
  assertTransition,
  parseConversationQuery,
  RANGE_DAYS,
  readJsonBody,
  validateEscalateBody,
  validateIntentBody,
  validateReplyBody,
  validateStatusBody,
} from './schemas.js';
import {
  toConversationSummary,
  toMessage,
  toReplyMessage,
  type ConversationRow,
  type MessageRow,
} from './serializers.js';

function notFound(): DashboardError {
  return new DashboardError({
    code: 'not_found',
    message: 'That conversation no longer exists.',
  });
}

async function requireConversation(db: Database, conversationId: string): Promise<ConversationRow> {
  const conversation = await repo.getConversation(db, conversationId);
  if (!conversation) throw notFound();
  return conversation;
}

/* ------------------------------------------------------------------- reads */

export async function listConversationsHandler(
  request: Request,
  url: URL,
  db: Database,
  auth: AuthContext,
): Promise<Response> {
  requirePermission(auth, 'conversation.read');
  const query = parseConversationQuery(url);
  const generatedAt = now();
  const fromIso = new Date(
    new Date(generatedAt).getTime() - RANGE_DAYS[query.range] * 86_400_000,
  ).toISOString();
  const { rows, total } = await repo.listConversations(db, query, { fromIso });
  const data = rows.map((row) => toConversationSummary(row, generatedAt));
  return json({
    data,
    page: query.page,
    page_size: query.pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / query.pageSize)),
    generated_at: generatedAt,
  });
}

function humanizeSourceId(id: string): string {
  return id
    .replace(/^\d+-/, '')
    .replace(/\.md$/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

function recentSources(messages: MessageRow[]): { id: string; title: string; url: string }[] {
  const byId = new Map<string, { id: string; title: string; url: string }>();
  const kb = new Map(KB_SOURCES.map((source) => [source.file, source]));
  for (const message of [...messages].reverse()) {
    for (const source of message.source_urls || []) {
      if (source?.id && !byId.has(source.id)) byId.set(source.id, source);
    }
    for (const id of message.source_ids || []) {
      if (byId.has(id)) continue;
      const match = kb.get(id);
      byId.set(id, { id, title: match?.title ?? humanizeSourceId(id), url: match?.url ?? '' });
    }
  }
  return [...byId.values()].filter((source) => source.url).slice(0, 6);
}

function summaryLines(row: ConversationRow, messages: MessageRow[]): string[] {
  const inbound = messages.filter((message) => message.direction === 'inbound').length;
  const outbound = messages.length - inbound;
  const lines: string[] = [];
  lines.push(
    `${messages.length} messages so far — ${inbound} inbound, ${outbound} outbound.`,
  );
  lines.push(
    `Handling: ${row.handling_mode}. Status: ${row.status}. Intent: ${row.current_intent ?? 'unclassified'}.`,
  );
  const sources = recentSources(messages);
  if (sources.length > 0) {
    lines.push(`Grounded in ${sources.length} knowledge-base source${sources.length === 1 ? '' : 's'}.`);
  }
  if (row.has_error) lines.push('A delivery or model error is attached to this thread.');
  if (row.unread_count > 0) lines.push(`${row.unread_count} unread messages await a human.`);
  return lines;
}

export async function getConversationHandler(
  request: Request,
  db: Database,
  auth: AuthContext,
  conversationId: string,
): Promise<Response> {
  requirePermission(auth, 'conversation.read');
  const row = await requireConversation(db, conversationId);
  const messages = await repo.getConversationMessages(db, conversationId);
  const generatedAt = now();
  return json({
    summary: toConversationSummary(row, generatedAt),
    messages: messages.map((message) => toMessage(message, row.contact_name)),
    summaryLines: summaryLines(row, messages),
    recentSources: recentSources(messages),
  });
}

/* ------------------------------------------------------------------ writes */

async function sendOperatorText(phone: string, body: string): Promise<void> {
  const { chunkForWhatsApp } = await import('../response-format.js');
  const chunks = chunkForWhatsApp(body, 1500).filter((chunk) => chunk.trim());
  for (const chunk of chunks) {
    await sendText(catalogueConfig.phoneNumberId, phone, chunk);
  }
}

export async function replyHandler(
  request: Request,
  db: Database,
  auth: AuthContext,
  conversationId: string,
): Promise<Response> {
  requirePermission(auth, 'conversation.reply');
  const payload = await readJsonBody<{ body?: unknown; clientTag?: unknown }>(request);
  const { body, clientTag } = validateReplyBody(payload);
  const row = await requireConversation(db, conversationId);

  const limit = await checkSharedRateLimit(
    db,
    rateLimitKey('reply', auth.operator.id, conversationId),
    { windowMs: 60_000, max: 30 },
  );
  if (!limit.allowed) {
    throw new DashboardError({
      code: 'rate_limited',
      message: 'You are sending replies very quickly. Try again shortly.',
      retryAfterSec: limit.retryAfterSec,
    });
  }

  const inserted = await repo.insertConversationMessage(db, {
    conversationId,
    contactId: row.contact_id,
    direction: 'outbound',
    body,
    channel: 'operator',
    authorType: 'operator',
    authorId: auth.operator.id,
    authorName: auth.operator.name,
    clientTag,
    deliveryStatus: 'pending',
  });

  if (!inserted.created) {
    const existing = await repo.getMessageById(db, inserted.id);
    return json({ message: existing ? toReplyMessage(existing) : null });
  }

  const phone = row.contact_phone;
  try {
    if (!phone) throw new Error('contact has no phone number');
    await sendOperatorText(phone, body);
    await repo.updateMessageDelivery(db, inserted.id, 'delivered', null);
  } catch (error) {
    const note = 'WhatsApp delivery failed. The message is saved; retry when the channel recovers.';
    await repo.updateMessageDelivery(db, inserted.id, 'failed', note);
    await repo.insertConversationEvent(db, {
      conversationId,
      eventType: 'reply_failed',
      actorType: 'system',
      actorId: auth.operator.id,
      nextValue: { messageId: inserted.id },
      note: error instanceof Error ? error.message : String(error),
    });
    const failed = await repo.getMessageById(db, inserted.id);
    throw new DashboardError({
      code: 'unavailable',
      message: note,
      details: { message: failed ? toReplyMessage(failed) : null },
    });
  }

  const saved = await repo.getMessageById(db, inserted.id);
  return json({ message: saved ? toReplyMessage(saved) : null }, 201);
}

export async function statusHandler(
  request: Request,
  db: Database,
  auth: AuthContext,
  conversationId: string,
): Promise<Response> {
  requirePermission(auth, 'conversation.status');
  const payload = await readJsonBody<{ status?: unknown }>(request);
  const next = validateStatusBody(payload);
  const row = await requireConversation(db, conversationId);
  const allowReopen =
    auth.operator.role === 'supervisor' || auth.operator.role === 'admin';
  assertTransition(row.status, next, { allowReopenFromResolved: allowReopen });
  await repo.updateConversationStatus(db, conversationId, next, {
    id: auth.operator.id,
    type: 'operator',
  });
  const updated = await repo.getConversation(db, conversationId);
  return json({ summary: toConversationSummary(updated ?? row, now()) });
}

export async function escalateHandler(
  request: Request,
  db: Database,
  auth: AuthContext,
  conversationId: string,
): Promise<Response> {
  requirePermission(auth, 'conversation.escalate');
  const payload = await readJsonBody<{ note?: unknown }>(request);
  const { note } = validateEscalateBody(payload);
  const row = await requireConversation(db, conversationId);
  await repo.escalateConversation(db, conversationId, { id: auth.operator.id }, note);
  const notified = await notifyDeskSupport(row, note, auth);
  const updated = await repo.getConversation(db, conversationId);
  const body: Record<string, unknown> = {
    summary: toConversationSummary(updated ?? row, now()),
    notified,
  };
  if (!notified) {
    body.partialError =
      'The conversation is marked as escalated, but the support desk was not notified.';
  }
  return json(body);
}

export async function notifyDeskSupport(
  row: ConversationRow,
  note: string | null,
  auth: AuthContext,
): Promise<boolean> {
  const endpoint = (process.env.DASHBOARD_DESK_WEBHOOK_URL || '').trim();
  if (!endpoint) return false;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        conversationId: row.id,
        status: row.status,
        intent: row.current_intent,
        note: note ?? undefined,
        raisedBy: auth.operator.name,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error('[dashboard] desk notification failed', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function intentHandler(
  request: Request,
  db: Database,
  auth: AuthContext,
  conversationId: string,
): Promise<Response> {
  requirePermission(auth, 'conversation.intent');
  const payload = await readJsonBody<{ intent?: unknown }>(request);
  const next = validateIntentBody(payload);
  const row = await requireConversation(db, conversationId);
  await repo.updateConversationIntent(db, conversationId, next, { id: auth.operator.id });
  const updated = await repo.getConversation(db, conversationId);
  return json({ summary: toConversationSummary(updated ?? row, now()) });
}
