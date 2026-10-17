/**
 * Request/query validation for the dashboard API. Every rejected request
 * becomes a structured `DashboardError` with an operator-safe message; no
 * raw request values are ever echoed back.
 */

import { DashboardError } from './errors.js';

export const RANGE_IDS = ['24h', '7d', '30d'] as const;
export type RangeId = (typeof RANGE_IDS)[number];

export const RANGE_DAYS: Record<RangeId, number> = { '24h': 1, '7d': 7, '30d': 30 };

export const CONVERSATION_STATUSES = [
  'new',
  'in_progress',
  'awaiting_contact',
  'needs_review',
  'resolved',
  'failed',
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const HANDLING_MODES = ['ai', 'human', 'escalated'] as const;
export type HandlingMode = (typeof HANDLING_MODES)[number];

export const INTENTS = [
  'greeting',
  'coverage',
  'claims',
  'reimbursements',
  'healthcare_navigation',
  'providers',
  'pharmacy',
  'medicines',
  'visa_compliance',
  'waiting_periods',
  'student_rewards',
  'updates',
  'forms_and_guides',
  'support',
  'emergency',
  'unknown',
] as const;
export type Intent = (typeof INTENTS)[number];

export const LANGUAGES = ['en', 'zh-CN', 'es'] as const;
export type DashboardLanguage = (typeof LANGUAGES)[number];

export const SORT_IDS = ['recent', 'oldest', 'unread', 'idle'] as const;
export type SortId = (typeof SORT_IDS)[number];

const MAX_PAGE_SIZE = 50;

function invalid(message: string): DashboardError {
  return new DashboardError({ code: 'validation', message });
}

export function parseRange(value: string | null): RangeId {
  if (value && (RANGE_IDS as readonly string[]).includes(value)) return value as RangeId;
  return '7d';
}

export function isValidRange(value: string): value is RangeId {
  return (RANGE_IDS as readonly string[]).includes(value);
}

function positiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

export interface ConversationListQuery {
  page: number;
  pageSize: number;
  search: string;
  status: 'all' | ConversationStatus;
  intent: 'all' | Intent;
  language: 'all' | DashboardLanguage;
  direction: 'all' | 'inbound' | 'outbound';
  handling: 'all' | HandlingMode;
  hasError: 'all' | 'with-error';
  range: RangeId;
  sort: SortId;
}

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | 'all' {
  if (!value || value === 'all') return 'all';
  return (allowed as readonly string[]).includes(value) ? (value as T) : 'all';
}

export function parseConversationQuery(url: URL): ConversationListQuery {
  const params = url.searchParams;
  const pageSize = Math.min(positiveInt(params.get('page_size'), 10), MAX_PAGE_SIZE);
  return {
    page: positiveInt(params.get('page'), 1),
    pageSize,
    search: (params.get('q') || '').slice(0, 120),
    status: oneOf(params.get('status'), CONVERSATION_STATUSES),
    intent: oneOf(params.get('intent'), INTENTS),
    language: oneOf(params.get('language'), LANGUAGES),
    direction: oneOf(params.get('direction'), ['inbound', 'outbound'] as const),
    handling: oneOf(params.get('handling'), HANDLING_MODES),
    hasError: params.get('has_error') === 'with-error' ? 'with-error' : 'all',
    range: parseRange(params.get('range')),
    sort: oneOf(params.get('sort'), SORT_IDS) === 'all' ? 'recent' : (params.get('sort') as SortId),
  };
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw invalid('The request body must be valid JSON.');
  }
}

const MAX_MESSAGE_CHARS = 4000;

export function validateReplyBody(body: { body?: unknown; clientTag?: unknown }): {
  body: string;
  clientTag: string | null;
} {
  const text = typeof body?.body === 'string' ? body.body : '';
  const trimmed = text.trim();
  if (!trimmed) throw invalid('A reply body is required.');
  if (text.length > MAX_MESSAGE_CHARS) {
    throw invalid(`A reply cannot exceed ${MAX_MESSAGE_CHARS} characters.`);
  }
  // Reject control characters other than newline/tab which WhatsApp accepts.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    throw invalid('A reply cannot contain control characters.');
  }
  const clientTag =
    typeof body?.clientTag === 'string' && body.clientTag.trim()
      ? body.clientTag.trim().slice(0, 120)
      : null;
  return { body: trimmed, clientTag };
}

export function validateStatusBody(body: { status?: unknown }): ConversationStatus {
  const status = body?.status;
  if (typeof status !== 'string' || !(CONVERSATION_STATUSES as readonly string[]).includes(status)) {
    throw invalid('A valid conversation status is required.');
  }
  return status as ConversationStatus;
}

export function validateIntentBody(body: { intent?: unknown }): Intent {
  const intent = body?.intent;
  if (typeof intent !== 'string' || !(INTENTS as readonly string[]).includes(intent)) {
    throw invalid('A valid intent is required.');
  }
  return intent as Intent;
}

export function validateEscalateBody(body: { note?: unknown }): { note: string | null } {
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  return { note: note || null };
}

/**
 * Status transition rules: arbitrary transitions are rejected with a
 * `conflict` so the UI can reflect the server decision.
 */
const ALLOWED_TRANSITIONS: Record<ConversationStatus, ConversationStatus[]> = {
  new: ['in_progress', 'awaiting_contact', 'needs_review', 'resolved', 'failed'],
  in_progress: ['awaiting_contact', 'needs_review', 'resolved', 'failed'],
  awaiting_contact: ['in_progress', 'needs_review', 'resolved', 'failed'],
  needs_review: ['in_progress', 'awaiting_contact', 'resolved', 'failed'],
  failed: ['needs_review', 'in_progress'],
  resolved: ['in_progress'],
};

export function assertTransition(
  from: ConversationStatus,
  to: ConversationStatus,
  opts: { allowReopenFromResolved?: boolean } = {},
): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (from === 'resolved' && to === 'in_progress' && opts.allowReopenFromResolved) return;
  if (!allowed.includes(to)) {
    throw new DashboardError({
      code: 'conflict',
      message: `A conversation cannot move from ${from} to ${to}.`,
    });
  }
}
