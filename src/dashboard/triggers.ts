/**
 * Trigger definitions and the operator run endpoint.
 *
 * Definitions live in the server (not the browser) and their availability is
 * derived from real configuration. A run is recorded before any external work
 * so a provider failure is auditable; the raw phone number is never stored —
 * only a masked value and a hash.
 */

import { createHash } from 'node:crypto';
import type { Database } from '../db.js';
import { catalogueConfig } from '../config.js';
import { catalogueReply, ensureContact, listCategories } from '../catalogue.js';
import { sendFormattedText } from '../kapso.js';
import { id, json, now, normalizePhone } from '../lib.js';
import { startQuizForContact } from '../quiz/service.js';
import type { AuthContext } from './auth.js';
import { requirePermission } from './auth.js';
import { DashboardError } from './errors.js';
import { checkSharedRateLimit, rateLimitKey } from './rate-limit.js';
import * as repo from './repository.js';
import { maskPhone, toTriggerExecution } from './serializers.js';
import { notifyDeskSupport } from './conversations.js';

export type TriggerAvailability = 'available' | 'coming_soon' | 'needs_config';

export interface TriggerField {
  id: string;
  kind: 'phone' | 'text' | 'conversation';
  label: string;
  description?: string;
  required: boolean;
  placeholder?: string;
  maxLength?: number;
}

export interface TriggerDefinition {
  id: string;
  name: string;
  description: string;
  intendedUse: string;
  backendNote: string;
  availability: TriggerAvailability;
  availabilityNote?: string;
  fields: TriggerField[];
}

function kapsoReady(): boolean {
  return Boolean(process.env.KAPSO_API_KEY && catalogueConfig.phoneNumberId);
}

export function triggerDefinitions(): TriggerDefinition[] {
  const kapso = kapsoReady();
  const flow = Boolean(catalogueConfig.flowId);
  return [
    {
      id: 'quiz',
      name: 'Start quiz session',
      description:
        'Delivers the OSHC quiz to a contact by phone number. Validates E.164, rate-limits to 5 starts per minute per contact, and resumes an active session instead of starting a new one.',
      intendedUse: 'Kick off a weekly quiz for one student.',
      backendNote:
        'Executed server-side through the Kapso WhatsApp primitives. The browser never holds the provider key.',
      availability: kapso ? 'available' : 'needs_config',
      availabilityNote: kapso
        ? undefined
        : 'Set KAPSO_API_KEY and KAPSO_PHONE_NUMBER_ID to enable quiz delivery.',
      fields: [
        {
          id: 'phone',
          kind: 'phone',
          label: 'Contact phone number',
          description: 'E.164 format such as +61412345620.',
          required: true,
        },
      ],
    },
    {
      id: 'catalogue-flow',
      name: 'Send catalogue flow',
      description:
        'Re-sends the OSHC service catalogue menu over WhatsApp, useful when a contact lost their catalogue screen mid-flow.',
      intendedUse: 'Bring someone back into the service catalogue.',
      backendNote: flow
        ? 'Sends the interactive flow when OSHC_FLOW_ID is configured; otherwise a plain catalogue menu.'
        : 'Sends the catalogue as a text menu. Set OSHC_FLOW_ID to deliver the interactive flow instead.',
      availability: kapso ? 'available' : 'needs_config',
      availabilityNote: kapso
        ? undefined
        : 'Set KAPSO_API_KEY and KAPSO_PHONE_NUMBER_ID to enable catalogue delivery.',
      fields: [
        {
          id: 'phone',
          kind: 'phone',
          label: 'Contact phone number',
          description: 'E.164 format such as +61498331177.',
          required: true,
        },
      ],
    },
    {
      id: 'follow-up',
      name: 'Send follow-up message',
      description:
        'Sends a one-off operator-written message to a contact through the dashboard while the assistant stays quiet.',
      intendedUse: 'Chase a claim document or missing receipt.',
      backendNote: 'Delivered verbatim through sendText so the operator words are preserved.',
      availability: kapso ? 'available' : 'needs_config',
      availabilityNote: kapso
        ? undefined
        : 'Set KAPSO_API_KEY and KAPSO_PHONE_NUMBER_ID to send follow-ups.',
      fields: [
        {
          id: 'phone',
          kind: 'phone',
          label: 'Contact phone number',
          description: 'E.164 format such as +61455042891.',
          required: true,
        },
        {
          id: 'message',
          kind: 'text',
          label: 'Message body',
          description: 'Plain text; sent as-is.',
          required: true,
          maxLength: 4000,
        },
      ],
    },
    {
      id: 'escalate',
      name: 'Escalate conversation',
      description:
        'Hands a conversation to the human support desk and stops AI replies until resolution.',
      intendedUse:
        'Human takeover when the assistant hits its limits or the contact asks for a person.',
      backendNote:
        'Marks the conversation as escalated and notifies the desk when DASHBOARD_DESK_WEBHOOK_URL is set.',
      availability: 'available',
      availabilityNote:
        'Without DASHBOARD_DESK_WEBHOOK_URL the conversation is still marked escalated, and the run reports a partial result.',
      fields: [
        {
          id: 'conversation',
          kind: 'conversation',
          label: 'Conversation',
          description: 'Pick an open conversation.',
          required: true,
        },
      ],
    },
  ];
}

function findDefinition(triggerId: string): TriggerDefinition | undefined {
  return triggerDefinitions().find((definition) => definition.id === triggerId);
}

function hashPhone(phone: string): string {
  return createHash('sha256').update(phone).digest('hex');
}

export async function listTriggersHandler(
  request: Request,
  db: Database,
  auth: AuthContext,
): Promise<Response> {
  requirePermission(auth, 'execution.read');
  return json({ data: triggerDefinitions() });
}

interface RunBody {
  phone?: unknown;
  message?: unknown;
  conversationId?: unknown;
  idempotencyKey?: unknown;
}

function maskTarget(phone: string | null, conversationId: string | null): string {
  if (phone) return maskPhone(phone);
  if (conversationId) return `conversation ${conversationId}`;
  return '—';
}

export async function runTriggerHandler(
  request: Request,
  db: Database,
  auth: AuthContext,
  triggerId: string,
): Promise<Response> {
  requirePermission(auth, 'trigger.run');
  const definition = findDefinition(triggerId);
  if (!definition) {
    throw new DashboardError({ code: 'not_found', message: 'That trigger does not exist.' });
  }

  const payload = await readRunBody(request);
  const idempotencyKey =
    typeof payload.idempotencyKey === 'string' && payload.idempotencyKey.trim()
      ? payload.idempotencyKey.trim().slice(0, 120)
      : null;

  // Resolve and validate inputs before touching the provider.
  let phone: string | null = null;
  let message: string | null = null;
  let conversationId: string | null = null;

  if (definition.fields.some((field) => field.kind === 'phone')) {
    phone = normalizePhone(payload.phone);
    if (!phone) {
      throw new DashboardError({
        code: 'validation',
        message: 'A valid E.164 phone number is required (for example +61412345620).',
      });
    }
  }
  if (definition.id === 'follow-up') {
    message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!message) {
      throw new DashboardError({ code: 'validation', message: 'A message body is required.' });
    }
    if (message.length > 4000) {
      throw new DashboardError({
        code: 'validation',
        message: 'A follow-up cannot exceed 4000 characters.',
      });
    }
  }
  if (definition.id === 'escalate') {
    conversationId =
      typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';
    if (!conversationId) {
      throw new DashboardError({ code: 'validation', message: 'Choose a conversation to escalate.' });
    }
  }

  const targetMasked = maskTarget(phone, conversationId);
  const startedAt = now();

  if (definition.availability !== 'available') {
    await recordRejection(db, auth, definition, {
      targetMasked,
      phone,
      conversationId,
      idempotencyKey,
      startedAt,
      code: 'unavailable',
      message: definition.availabilityNote || 'This trigger is not available.',
    });
    throw new DashboardError({
      code: 'unavailable',
      message: definition.availabilityNote || 'This trigger is not available.',
    });
  }

  // Per-operator and per-target throttles protect the WhatsApp channel.
  const operatorLimit = await checkSharedRateLimit(
    db,
    rateLimitKey('trigger-op', auth.operator.id),
    { windowMs: 60_000, max: 30 },
  );
  const targetLimit = await checkSharedRateLimit(
    db,
    rateLimitKey('trigger-target', definition.id, phone ?? conversationId ?? ''),
    { windowMs: 60_000, max: definition.id === 'quiz' ? 5 : 10 },
  );
  if (!operatorLimit.allowed || !targetLimit.allowed) {
    const retryAfterSec = Math.max(operatorLimit.retryAfterSec, targetLimit.retryAfterSec);
    await recordRejection(db, auth, definition, {
      targetMasked,
      phone,
      conversationId,
      idempotencyKey,
      startedAt,
      code: 'rate_limited',
      message: 'Too many runs. Try again shortly.',
    });
    throw new DashboardError({
      code: 'rate_limited',
      message: 'Too many runs in a short window. Try again shortly.',
      retryAfterSec,
    });
  }

  const executionId = id();
  const insert = await repo.insertTriggerExecution(db, {
    id: executionId,
    triggerId: definition.id,
    triggerName: definition.name,
    operatorId: auth.operator.id,
    operatorName: auth.operator.name,
    conversationId,
    targetMasked,
    targetPhoneHash: phone ? hashPhone(phone) : null,
    idempotencyKey,
    requestJson: { target: targetMasked, note: message ? '[message withheld]' : undefined },
    startedAt,
  });
  if (!insert.created) {
    const existing = await repo.getTriggerExecution(db, insert.id);
    if (existing) return json({ execution: toTriggerExecution(existing) });
  }

  const startedMs = Date.now();
  try {
    const result = await executeTrigger(db, definition, auth, {
      phone,
      message,
      conversationId,
    });
    await repo.finishTriggerExecution(db, executionId, {
      status: 'success',
      resultJson: result,
      durationMs: Date.now() - startedMs,
    });
  } catch (error) {
    const code = error instanceof DashboardError ? error.code : 'unavailable';
    const messageText =
      error instanceof DashboardError
        ? error.message
        : 'The provider could not complete the run.';
    await repo.finishTriggerExecution(db, executionId, {
      status: error instanceof DashboardError && error.code === 'validation' ? 'rejected' : 'failed',
      errorCode: code,
      errorMessage: messageText,
      durationMs: Date.now() - startedMs,
    });
    throw new DashboardError({ code: 'unavailable', message: messageText });
  }

  const record = await repo.getTriggerExecution(db, executionId);
  return json({ execution: record ? toTriggerExecution(record) : null }, 201);
}

async function readRunBody(request: Request): Promise<RunBody> {
  try {
    return (await request.json()) as RunBody;
  } catch {
    return {};
  }
}

async function executeTrigger(
  db: Database,
  definition: TriggerDefinition,
  auth: AuthContext,
  input: { phone: string | null; message: string | null; conversationId: string | null },
): Promise<{ reference?: string; detail?: string }> {
  switch (definition.id) {
    case 'quiz': {
      const contact = await ensureContact(db, input.phone!, 'WhatsApp user');
      const result = await startQuizForContact(db, { id: contact.id, phone: contact.phone });
      return {
        reference: result.sessionNumber
          ? `session #${result.sessionNumber} · delivery=${result.delivery}`
          : `delivery=${result.delivery}`,
        detail: result.resumed
          ? 'An active quiz session was resumed for this contact.'
          : 'A new quiz session was delivered.',
      };
    }
    case 'catalogue-flow': {
      const contact = await ensureContact(db, input.phone!, 'WhatsApp user');
      const categories = await listCategories(db);
      await sendFormattedText(catalogueConfig.phoneNumberId, contact.phone, catalogueReply(categories));
      return {
        reference: 'catalogue menu sent',
        detail: 'The service catalogue was delivered to the contact.',
      };
    }
    case 'follow-up': {
      const contact = await ensureContact(db, input.phone!, 'WhatsApp user');
      await sendFormattedText(catalogueConfig.phoneNumberId, contact.phone, input.message!);
      return {
        reference: 'follow-up sent',
        detail: 'The follow-up message was delivered to the contact.',
      };
    }
    case 'escalate': {
      const conversation = await repo.getConversation(db, input.conversationId!);
      if (!conversation) {
        throw new DashboardError({ code: 'not_found', message: 'That conversation no longer exists.' });
      }
      await repo.escalateConversation(db, conversation.id, { id: auth.operator.id }, null);
      const notified = await notifyDeskSupport(conversation, null, auth);
      return {
        reference: 'conversation escalated',
        detail: notified
          ? 'The desk was notified and the conversation is under human care.'
          : 'The conversation is escalated; the desk webhook is not configured.',
      };
    }
    default:
      throw new DashboardError({ code: 'validation', message: 'That trigger cannot be run.' });
  }
}

async function recordRejection(
  db: Database,
  auth: AuthContext,
  definition: TriggerDefinition,
  input: {
    targetMasked: string;
    phone: string | null;
    conversationId: string | null;
    idempotencyKey: string | null;
    startedAt: string;
    code: string;
    message: string;
  },
): Promise<void> {
  const executionId = id();
  const insert = await repo.insertTriggerExecution(db, {
    id: executionId,
    triggerId: definition.id,
    triggerName: definition.name,
    operatorId: auth.operator.id,
    operatorName: auth.operator.name,
    conversationId: input.conversationId,
    targetMasked: input.targetMasked,
    targetPhoneHash: input.phone ? hashPhone(input.phone) : null,
    idempotencyKey: input.idempotencyKey,
    requestJson: { target: input.targetMasked },
    startedAt: input.startedAt,
  });
  if (!insert.created) return;
  await repo.finishTriggerExecution(db, executionId, {
    status: 'rejected',
    errorCode: input.code,
    errorMessage: input.message,
    durationMs: 0,
  });
}
