/**
 * Privacy-safe response mapping. Every phone number leaving the dashboard is
 * masked here — the browser never receives a raw number, and previews are
 * redacted to a single short sentence for list responses.
 */

import type {
  ConversationStatus,
  DashboardLanguage,
  HandlingMode,
  Intent,
} from './schemas.js';

/** Masked for display: keeps the country prefix and the last three digits. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 5) return '••••';
  return `+${digits.slice(0, 2)} ••• ••• ${digits.slice(-3)}`;
}

export function initialsFor(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((part) => [...part][0]?.toUpperCase() ?? '').join('');
}

export function normalizeLanguage(value: string | null | undefined): DashboardLanguage {
  if (value === 'zh-CN' || value === 'zh') return 'zh-CN';
  if (value === 'es') return 'es';
  return 'en';
}

/** First sentence, hard-capped. Never returns a full message body. */
export function safePreview(body: string | null | undefined, max = 120): string {
  const text = (body || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'No messages yet';
  const sentence = text.split(/(?<=[.!?。！？])\s/)[0] || text;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).trimEnd()}…`;
}

export interface ContactRefDto {
  id: string;
  maskedPhone: string;
  displayName: string;
  initials: string;
  language: DashboardLanguage;
  optedIn: boolean;
}

export interface ConversationSummaryDto {
  id: string;
  contact: ContactRefDto;
  status: ConversationStatus;
  intent: Intent;
  handlingMode: HandlingMode;
  lastMessagePreview: string;
  lastMessageDirection: 'inbound' | 'outbound';
  lastActivityAt: string;
  generatedAt: string;
  startedAt: string;
  messageCount: number;
  unreadCount: number;
  hasError: boolean;
  language: DashboardLanguage;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  kind: 'message' | 'system';
  author: { type: 'contact' | 'assistant' | 'operator' | 'system'; name: string };
  body: string;
  createdAt: string;
  intent?: Intent;
  llmModel?: string;
  latencyMs?: number;
  sourceIds?: string[];
  delivery?: 'pending' | 'delivered' | 'failed' | 'unsupported';
  failureNote?: string;
}

export interface TriggerExecutionDto {
  id: string;
  triggerId: string;
  triggerName: string;
  status: 'running' | 'success' | 'failed' | 'rejected';
  operator: string;
  target: string;
  conversationId?: string;
  startedAt: string;
  durationMs?: number;
  sync: 'server' | 'local';
  result?: { reference?: string; detail?: string };
  error?: { code: string; message: string };
}

export type ConversationRow = {
  id: string;
  status: ConversationStatus;
  handling_mode: HandlingMode;
  current_intent: string | null;
  last_activity_at: string | null;
  first_message_at: string | null;
  message_count: number;
  unread_count: number;
  has_error: boolean;
  contact_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  preferred_language: string | null;
  opted_in: boolean | null;
  last_body: string | null;
  last_direction: 'inbound' | 'outbound' | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  message_type: string | null;
  channel: string | null;
  author_type: string | null;
  author_name: string | null;
  body: string | null;
  intent: string | null;
  source_ids: string[] | null;
  source_urls: Array<{ id: string; title: string; url: string }> | null;
  llm_model: string | null;
  latency_ms: number | null;
  delivery_status: string | null;
  failure_note: string | null;
  error_code: string | null;
  created_at: string;
};

export type TriggerExecutionRow = {
  id: string;
  trigger_id: string;
  trigger_name: string | null;
  operator_id: string | null;
  operator_name: string | null;
  conversation_id: string | null;
  target_masked: string | null;
  status: 'running' | 'success' | 'failed' | 'rejected';
  result_json: { reference?: string; detail?: string } | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  duration_ms: number | null;
};

const KNOWN_INTENTS = new Set<string>([
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
]);

export function normalizeIntent(value: string | null | undefined): Intent {
  return value && KNOWN_INTENTS.has(value) ? (value as Intent) : 'unknown';
}

function deliveryState(
  value: string | null,
): MessageDto['delivery'] | undefined {
  switch (value) {
    case 'pending':
    case 'submitted':
    case 'queued':
      return 'pending';
    case 'delivered':
      return 'delivered';
    case 'failed':
      return 'failed';
    default:
      return undefined;
  }
}

function authorType(row: MessageRow): MessageDto['author']['type'] {
  if (row.author_type === 'operator' || row.channel === 'operator') return 'operator';
  if (row.author_type === 'system' || row.channel === 'system' || row.message_type === 'system') {
    return 'system';
  }
  if (row.direction === 'inbound') return 'contact';
  return 'assistant';
}

function authorName(row: MessageRow, type: MessageDto['author']['type'], contactName: string | null): string {
  if (row.author_name) return row.author_name;
  if (type === 'contact') return contactName || 'Contact';
  if (type === 'operator') return 'Operator';
  if (type === 'system') return 'System';
  return 'Assistant';
}

export function toContactRef(row: ConversationRow): ContactRefDto {
  const displayName = row.contact_name?.trim() || 'WhatsApp user';
  return {
    id: row.contact_id,
    maskedPhone: maskPhone(row.contact_phone),
    displayName,
    initials: initialsFor(displayName),
    language: normalizeLanguage(row.preferred_language),
    optedIn: row.opted_in ?? true,
  };
}

export function toConversationSummary(
  row: ConversationRow,
  generatedAt: string,
): ConversationSummaryDto {
  const language = normalizeLanguage(row.preferred_language);
  return {
    id: row.id,
    contact: toContactRef(row),
    status: row.status,
    intent: normalizeIntent(row.current_intent),
    handlingMode: row.handling_mode,
    lastMessagePreview: safePreview(row.last_body),
    lastMessageDirection: row.last_direction === 'outbound' ? 'outbound' : 'inbound',
    lastActivityAt: row.last_activity_at || row.first_message_at || generatedAt,
    generatedAt,
    startedAt: row.first_message_at || row.last_activity_at || generatedAt,
    messageCount: Number(row.message_count || 0),
    unreadCount: Number(row.unread_count || 0),
    hasError: Boolean(row.has_error),
    language,
  };
}

export function toMessage(
  row: MessageRow,
  contactName: string | null,
): MessageDto {
  const type = authorType(row);
  const message: MessageDto = {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    kind: type === 'system' ? 'system' : 'message',
    author: { type, name: authorName(row, type, contactName) },
    body: row.body || '',
    createdAt: row.created_at,
  };
  if (row.intent && KNOWN_INTENTS.has(row.intent)) message.intent = row.intent as Intent;
  if (row.llm_model) message.llmModel = row.llm_model;
  if (typeof row.latency_ms === 'number') message.latencyMs = row.latency_ms;
  if (Array.isArray(row.source_ids) && row.source_ids.length > 0) {
    message.sourceIds = row.source_ids;
  }
  const delivery = deliveryState(row.delivery_status);
  if (delivery) message.delivery = delivery;
  if (row.failure_note) message.failureNote = row.failure_note;
  return message;
}

export function toTriggerExecution(row: TriggerExecutionRow): TriggerExecutionDto {
  const execution: TriggerExecutionDto = {
    id: row.id,
    triggerId: row.trigger_id,
    triggerName: row.trigger_name || row.trigger_id,
    status: row.status,
    operator: row.operator_name || row.operator_id || 'dashboard',
    target: row.target_masked || '—',
    startedAt: row.started_at,
    sync: 'server',
  };
  if (row.conversation_id) execution.conversationId = row.conversation_id;
  if (typeof row.duration_ms === 'number') execution.durationMs = row.duration_ms;
  if (row.status === 'success' && row.result_json) {
    execution.result = row.result_json;
  }
  if (row.error_code || row.error_message) {
    execution.error = {
      code: row.error_code || 'unavailable',
      message: row.error_message || 'The run did not complete.',
    };
  }
  return execution;
}

/** Map a stored operator reply row to the send-response message shape. */
export function toReplyMessage(row: MessageRow): MessageDto {
  return toMessage(row, null);
}
