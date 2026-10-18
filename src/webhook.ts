import { createHmac, timingSafeEqual } from 'node:crypto';
import {recordArrivalQuizConsent,withdrawArrivalQuizConsent} from './onboarding/service.js';
import { saveArrivalDate } from './onboarding/service.js';
import type { Database } from './db.js';

import { EMERGENCY_NUMBER_AU, catalogueConfig } from './config.js';

import { catalogueReply, ensureContact, listCategories, listServices, lockPreferredLanguage, sendCatalogueFlow, servicesReply } from './catalogue.js';
import { getMenuOptions, getQuickMenuOptions, t } from './i18n.js';
import { canonicalizeForMatch, normalizeInput, resolveCommandAlias } from './input-normalization.js';
import { recentTurns, saveTurn } from './conversation.js';

import { FlowRegistry } from './flows.js';

import { detectLanguage } from './language.js';
import { id, json, now } from './lib.js';
import { answerQuiz, handleQuizText } from './quiz/service.js';
import { MENU_OPTIONS, answerWithSources, classifyIntent, resolveMenuSelection, staticAnswerFor } from './router.js';

import { emergencyCallText, emergencyReply, isEmergency, isGreeting } from './safety.js';

import type { Contact, FlowResponse, SupportedLanguage } from './types.js';

interface KapsoMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
    nfm_reply?: { response_json?: string };
  };
  kapso?: { flow_response?: FlowResponse; flow_token?: string; flow_name?: string; contact_name?: string };

}

interface KapsoPayload {
  phone_number_id?: string;
  message?: KapsoMessage;
  conversation?: { contact_name?: string; kapso?: { contact_name?: string } };

}

export function flowResponseFrom(message: KapsoMessage): FlowResponse | null {
  if (message.kapso?.flow_response) return message.kapso.flow_response;
  const raw = message.interactive?.nfm_reply?.response_json;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...parsed,
      ...(typeof parsed.flow_token === 'string' ? { flowToken: parsed.flow_token } : {}),
      ...(typeof parsed.flow_name === 'string' ? { flowName: parsed.flow_name } : {}),
    };
  } catch { return null; }

}

export function messageText(message: KapsoMessage): string {
  const btn = message.interactive?.button_reply;
  if (btn?.id || btn?.title) return (btn.id || btn.title || '').trim();
  const list = message.interactive?.list_reply;
  if (list?.id || list?.title) return (list.id || list.title || '').trim();
  return (message.text?.body || '').trim();

}

function isLanguageNeutralSelection(text: string): boolean {
  return /^(\d|menu:.*)$/.test(canonicalizeForMatch(text));
}

function isFullMenuRequest(text: string): boolean {
  const c = canonicalizeForMatch(text);
  return c === 'menu' || c === 'menú' || c === 'menus' || c === 'options' || c === 'opciones' || text.trim() === '菜单' || resolveCommandAlias(c) === 'menu';
}

export async function resolveContactLanguage(
  db: Database,
  contact: Contact,
  text: string,

): Promise<SupportedLanguage> {
  if (contact.preferredLanguage === 'en' || contact.preferredLanguage === 'zh-CN' || contact.preferredLanguage === 'es') {
    return contact.preferredLanguage;
  }
  // Language-neutral menu taps/numbers carry no signal — don't lock on them.
  if (!text.trim() || isLanguageNeutralSelection(text)) return 'en';
  const detected = detectLanguage(text).language;
  const locked = await lockPreferredLanguage(db, contact.id, detected);
  contact.preferredLanguage = locked;
  return locked;

}

async function sendGreeting(phoneNumberId: string, to: string, lang: SupportedLanguage, full = false): Promise<void> {
  const kapso = await import('./kapso.js');
  const body = full ? t(lang, 'fullMenu') : t(lang, 'greeting');
  const options = full ? getMenuOptions(lang) : getQuickMenuOptions(lang);
  const sections = [
    {
      title: 'OSHC',
      rows: options.map((o) => ({
        id: `menu:${menuIdFor(o.intent)}`,
        title: o.label.slice(0, 24),
        description: o.description.slice(0, 72),
      })),
    },
  ];
  // Rich list first (5 quick goals, or full 9 on MENU), then buttons, then text.
  try {
    await kapso.sendList(phoneNumberId, to, body, t(lang, 'chooseTopic'), sections, t(lang, 'menuFooter'));
    return;
  } catch { /* fall through */ }
  try {
    const buttons = options.slice(0, 3);
    await kapso.sendButtons(phoneNumberId, to, body.slice(0, 900), buttons.map((o) => ({
      id: `menu:${menuIdFor(o.intent)}`,
      title: o.label.slice(0, 20),
    })), t(lang, 'replyMenuHint'));
    return;
  } catch { /* fall through */ }
  await kapso.sendText(phoneNumberId, to, body);
}

function menuIdFor(intent: string): string {
  const map: Record<string, string> = {
    coverage: 'coverage',
    claims: 'claims',
    reimbursements: 'claims',
    healthcare_navigation: 'healthcare',
    providers: 'providers',
    pharmacy: 'pharmacy',
    medicines: 'pharmacy',
    visa_compliance: 'visa',
    waiting_periods: 'visa',
    student_rewards: 'rewards',
    updates: 'updates',
    forms_and_guides: 'forms',
    support: 'support',
    emergency: 'emergency',
  };
  return map[intent] || 'support';

}

async function sendEmergency(phoneNumberId: string, to: string, lang: SupportedLanguage): Promise<void> {
  const kapso = await import('./kapso.js');
  const body = emergencyReply(lang);
  // Always send the text first so the number is visible even if interactive fails.
  await kapso.sendText(phoneNumberId, to, body);
  try {
    await kapso.sendEmergencyNumber(phoneNumberId, to, emergencyCallText(lang));
  } catch {
    await kapso.sendText(phoneNumberId, to, `Call now: tel:${EMERGENCY_NUMBER_AU} — dial ${EMERGENCY_NUMBER_AU} on your phone.`).catch(() => {});
  }

}

async function sendAnswer(phoneNumberId: string, to: string, text: string): Promise<void> {
  const kapso = await import('./kapso.js');
  // Centralized outbound contract: prose reflow, safe emphasis, chunked send.
  await kapso.sendFormattedText(phoneNumberId, to, text);

}

export function isSupportKeyword(text: string): boolean {
  const raw = normalizeInput(text);
  if (/^(support|soporte|ayuda|客服|帮助|supporto|help|ayua|contacto)$/i.test(raw)) return true;
  return resolveCommandAlias(canonicalizeForMatch(raw)) === 'support' || resolveCommandAlias(canonicalizeForMatch(raw)) === 'help';
}

async function handleText(
  db: Database,
  contact: Awaited<ReturnType<typeof ensureContact>>,
  rawText: string,
  waMessageId?: string,

): Promise<void> {
  const phoneId = catalogueConfig.phoneNumberId;
  const text = (rawText || '').trim();
  const lang = await resolveContactLanguage(db, contact, text);
  if (!text) {
    await sendAnswer(phoneId, contact.phone, t(lang, 'emptyMessage'));
    return;
  }
  await saveTurn(db, contact.id, 'inbound', text, { waMessageId, language: lang });
  // 1) Emergency always wins — no LLM. Detection runs AFTER language lock so the
  // reply (including a first-message emergency) uses the user's language.
  if (isEmergency(text) || resolveMenuSelection(text) === 'emergency') {
    await sendEmergency(phoneId, contact.phone, lang);
    await saveTurn(db, contact.id, 'outbound', emergencyReply(lang), { intent: 'emergency', language: lang });
    return;
  }

  // 1b) Quiz mode: explicit QUIZ / START QUIZ starts a session, an active
  // session consumes answers and YES / START resumes. Emergency already
  // handled above, so quiz can never block an emergency request.
  // Arrival-based quiz invitation consent
  const command = text.toLowerCase().replace(/\s+/g, ' ').trim();

  if (command === 'arrival quiz on') {
    const updated = await recordArrivalQuizConsent(db, contact.id);

    const reply = updated
      ? 'You have opted in to receive an OSHC Compass quiz invitation two days after your planned arrival in Australia. Reply ARRIVAL QUIZ OFF or STOP to opt out.'
      : 'We could not find your OSHC onboarding record. Please complete onboarding first.';

    await sendAnswer(phoneId, contact.phone, reply);
    await saveTurn(db, contact.id, 'outbound', reply, {
      intent: 'onboarding_consent',
      language: lang,
    });

    return;
  }

  if (command === 'arrival quiz off') {
    const updated = await withdrawArrivalQuizConsent(db, contact.id);

    const reply = updated
      ? 'Your arrival quiz invitations are now turned off. You can still start a quiz anytime by replying QUIZ.'
      : 'No arrival quiz onboarding record was found.';

    await sendAnswer(phoneId, contact.phone, reply);
    await saveTurn(db, contact.id, 'outbound', reply, {
      intent: 'onboarding_consent',
      language: lang,
    });

    return;
  }

  // STOP also withdraws consent for scheduled arrival invitations.
  // The existing quiz handler below continues to handle quiz cancellation.
  if (command === 'stop' || command === 'stop reminders') {
    await withdrawArrivalQuizConsent(db, contact.id);
  }  
  // Capture the student's planned arrival date
  if (/^arrival date\b/i.test(text)) {
    const travelDate = text
      .replace(/^arrival date\b/i, '')
      .trim();

    let reply: string;

    try {
      const quizDueAt = await saveArrivalDate(
        db,
        contact.id,
        travelDate
      );

      const formattedDate = quizDueAt.toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney',
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      reply =
        `Thanks! Your arrival date is saved as ${travelDate}.\n\n` +
        `Your first OSHC quiz is scheduled for ${formattedDate} ` +
        `(Sydney/Melbourne time).`;

    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Travel date must be YYYY-MM-DD'
      ) {
        reply = 'Please send your date like this: ARRIVAL DATE 2026-10-16';
      } else {
        console.error('[onboarding] Arrival date failed:', error);
        reply = 'Unable to save your arrival date. Please check your onboarding record.';
      }
    }

    await sendAnswer(phoneId, contact.phone, reply);

    await saveTurn(db, contact.id, 'outbound', reply, {
      intent: 'onboarding_arrival',
      language: lang,
    });

    return;
  }  
  if (await handleQuizText(db, contact, text)) return;
  if (await answerQuiz(db, contact, text)) return;

  // 2) Greeting / menu: first-run gets 5 goals, MENU gets all 9.
  if (isGreeting(text)) {
    const full = isFullMenuRequest(text);
    await sendGreeting(phoneId, contact.phone, lang, full);
    await saveTurn(db, contact.id, 'outbound', full ? t(lang, 'fullMenu') : t(lang, 'greeting'), { intent: 'greeting', language: lang });
    return;
  }
  // 3) Direct menu selection (numbers, button ids).
  const menuIntent = resolveMenuSelection(text);
  if (menuIntent && isLanguageNeutralSelection(text)) {
    if (menuIntent === 'emergency') {
      await sendEmergency(phoneId, contact.phone, lang);
      await saveTurn(db, contact.id, 'outbound', emergencyReply(lang), { intent: 'emergency', language: lang });
      return;
    }
    const direct = staticAnswerFor(menuIntent, text, lang);
    if (direct) {
      await sendAnswer(phoneId, contact.phone, direct.text);
      await saveTurn(db, contact.id, 'outbound', direct.text, { intent: menuIntent, sourceIds: direct.sourceIds, sourceUrls: direct.sourceUrls, language: lang });
      return;
    }
    // Otherwise fall through to retrieval with the menu intent.
    const history = await recentTurns(db, contact.id);
    const ans = await answerWithSources(text, { intent: menuIntent, confidence: 1, needsClarification: false, keywords: [], source: 'deterministic' }, { history, language: lang });
    await sendAnswer(phoneId, contact.phone, ans.text);
    await saveTurn(db, contact.id, 'outbound', ans.text, { intent: ans.intent, sourceIds: ans.sourceIds, sourceUrls: ans.sourceUrls, llmModel: ans.model, language: lang });
    return;
  }
  // 4) SUPPORT keyword fast-path (multilingual).
  if (isSupportKeyword(text)) {
    const s = staticAnswerFor('support', text, lang)!;
    await sendAnswer(phoneId, contact.phone, s.text);
    await saveTurn(db, contact.id, 'outbound', s.text, { intent: 'support', sourceIds: s.sourceIds, sourceUrls: s.sourceUrls, language: lang });
    return;
  }
  // 5) LLM classification + grounded answer.
  const started = Date.now();
  const classification = await classifyIntent(text);
  if (classification.intent === 'emergency') {
    await sendEmergency(phoneId, contact.phone, lang);
    await saveTurn(db, contact.id, 'outbound', emergencyReply(lang), { intent: 'emergency', language: lang });
    return;
  }
  const history = await recentTurns(db, contact.id);
  const ans = await answerWithSources(text, classification, { history, language: lang });
  await sendAnswer(phoneId, contact.phone, ans.text);
  await saveTurn(db, contact.id, 'outbound', ans.text, {
    intent: ans.intent,
    sourceIds: ans.sourceIds,
    sourceUrls: ans.sourceUrls,
    llmModel: ans.model,
    latencyMs: Date.now() - started,
    language: lang,
  });
  // 6) Legacy catalogue fallback (English only, to avoid dumping English KB on other languages).
  if (lang === 'en' && !ans.usedLlm && !ans.sourceIds.length && ans.intent === 'unknown') {
    try {
      const normalized = text.toLowerCase();
      const categories = await listCategories(db);
      const category = categories.find((item, index) => String(index + 1) === normalized || item.name.toLowerCase() === normalized);
      if (category) {
        const { sendText } = await import('./kapso.js');
        await sendText(phoneId, contact.phone, servicesReply(await listServices(db, category.id)));
        return;
      }
      const services = await listServices(db);
      const service = services.find((item) => item.name.toLowerCase() === normalized || item.id === normalized);
      if (service) await sendCatalogueFlow(contact, service);
    } catch { /* best effort */ }
  }

}

// Keep old catalogue greeting helper exported for tests/back-compat.

export { catalogueReply };

export { MENU_OPTIONS };

/**
 * Kapso platform webhooks use a bare 64-character hex HMAC-SHA256 digest.
 * Verify the ORIGINAL request bytes, before parsing JSON.
 * Never use KAPSO_API_KEY or a Meta app secret as the webhook secret.
 */
function verifyKapsoSignature(body: Buffer, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function handleWebhook(request: Request, db: Database, registry: FlowRegistry): Promise<Response> {
  const raw = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-webhook-signature');
  const secret = (process.env.KAPSO_WEBHOOK_SECRET || '').trim();
  // Fail closed rather than accepting unsigned public webhooks.
  if (!secret) {
    console.error('[Kapso webhook] KAPSO_WEBHOOK_SECRET is not configured');
    return json({ error: 'Webhook configuration unavailable' }, 503);
  }
  if (!verifyKapsoSignature(raw, signature, secret)) {
    console.error('[Kapso webhook] Invalid signature', {
      signaturePresent: Boolean(signature),
      signatureFormatValid: Boolean(signature && /^[a-f0-9]{64}$/i.test(signature)),
      payloadBytes: raw.length,
    });
    return json({ error: 'Invalid signature' }, 401);
  }
  let payload: KapsoPayload;
  try {
    payload = JSON.parse(raw.toString('utf8')) as KapsoPayload;
  } catch {
    console.warn('[Kapso webhook] Malformed JSON');
    return json({ error: 'Invalid JSON' }, 400);
  }
  console.info('[Kapso webhook] Signature verified', {
    event: request.headers.get('x-webhook-event') ?? 'unknown',
    payloadVersion: request.headers.get('x-webhook-payload-version') ?? 'unknown',
    hasMessage: Boolean(payload.message),
  });
  if (payload.phone_number_id && catalogueConfig.phoneNumberId && payload.phone_number_id !== catalogueConfig.phoneNumberId) {
    console.warn('[Kapso webhook] Ignoring event for a different phone_number_id');
    return json({ ok: true });
  }
  const message = payload.message;
  if (!message?.id || !message.from) {
    console.info('[Kapso webhook] No processable message in payload');
    return json({ ok: true });
  }
  const eventId = `message:${message.id}`;
  const inserted = await db.query(
    'INSERT INTO webhook_events (id, event_key, payload, received_at) VALUES ($1, $2, $3, $4) ON CONFLICT (event_key) DO NOTHING',
    [id(), eventId, raw.toString('utf8'), now()],
  );
  if (!inserted.rowCount) {
    console.info('[Kapso webhook] Duplicate message ignored');
    return json({ ok: true });
  }
  const phone = `+${message.from.replace(/^\+/, '')}`;
  const contactName = message.kapso?.contact_name || payload.conversation?.kapso?.contact_name || payload.conversation?.contact_name || 'WhatsApp user';
  try {
    const contact = await ensureContact(db, phone, contactName);
    const flowResponse = flowResponseFrom(message);
    if (flowResponse) {
      await registry.dispatch(
        { ...flowResponse, flowName: flowResponse.flowName || message.kapso?.flow_name },
        { phone, contactId: contact.id, flowToken: flowResponse.flowToken || message.kapso?.flow_token, data: flowResponse },
      );
    } else {
      await handleText(db, contact, messageText(message), message.id);
    }
    await db.query('UPDATE webhook_events SET processed_at = $1 WHERE event_key = $2', [now(), eventId]);
    console.info('[Kapso webhook] Message processed');
    return json({ ok: true });
  } catch (error) {
    console.error('[Kapso webhook] Message processing failed', error);
    // Allow a subsequent Kapso retry to process this message rather than treating
    // an unsuccessful attempt as a permanently completed duplicate.
    try {
      await db.query('DELETE FROM webhook_events WHERE event_key = $1 AND processed_at IS NULL', [eventId]);
    } catch (cleanupError) {
      console.error('[Kapso webhook] Failed to release message for retry', cleanupError);
    }
    return json({ error: 'Message processing failed' }, 500);
  }
}
