import type { Database } from './db.js';
import { EMERGENCY_NUMBER_AU, assistantConfig, catalogueConfig } from './config.js';
import { catalogueReply, ensureContact, listCategories, listServices, sendCatalogueFlow, servicesReply } from './catalogue.js';
import { recentTurns, saveTurn } from './conversation.js';
import { FlowRegistry } from './flows.js';
import { id, json, now, verifyHmac } from './lib.js';
import { MENU_OPTIONS, answerWithSources, classifyIntent, resolveMenuSelection, staticAnswerFor } from './router.js';
import { emergencyReply, isEmergency, isGreeting } from './safety.js';
import type { FlowResponse } from './types.js';

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

async function sendGreeting(phoneNumberId: string, to: string): Promise<void> {
  const kapso = await import('./kapso.js');
  const sections = [
    {
      title: 'OSHC help',
      rows: MENU_OPTIONS.slice(0, 8).map((o) => ({
        id: `menu:${o.label.toLowerCase().split(' ')[0] === 'understand' ? 'coverage' : menuIdFor(o.intent)}`,
        title: o.label.slice(0, 24),
        description: o.description.slice(0, 72),
      })),
    },
  ];
  // Try rich list first (best for 8 options), then text fallback.
  try {
    await kapso.sendList(
      phoneNumberId,
      to,
      assistantConfig.greeting,
      'Choose topic',
      sections,
      'Medibank OSHC • general info only',
    );
    return;
  } catch { /* fall through */ }
  try {
    await kapso.sendButtons(phoneNumberId, to, assistantConfig.greeting.slice(0, 900), [
      { id: 'menu:coverage', title: 'My cover' },
      { id: 'menu:claims', title: 'Claims' },
      { id: 'menu:emergency', title: 'Urgent help' },
    ], 'Reply MENU anytime');
    return;
  } catch { /* fall through */ }
  await kapso.sendText(phoneNumberId, to, assistantConfig.greeting);
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

async function sendEmergency(phoneNumberId: string, to: string): Promise<void> {
  const kapso = await import('./kapso.js');
  const body = emergencyReply();
  // Always send the text first so the number is visible even if interactive fails.
  await kapso.sendText(phoneNumberId, to, body);
  try {
    await kapso.sendEmergencyNumber(phoneNumberId, to, `Tap to call ${EMERGENCY_NUMBER_AU} (Australia emergency) now. Stay on the line.`);
  } catch {
    await kapso.sendText(phoneNumberId, to, `Call now: tel:${EMERGENCY_NUMBER_AU} — dial ${EMERGENCY_NUMBER_AU} on your phone.`).catch(() => {});
  }
}

async function sendAnswer(phoneNumberId: string, to: string, text: string): Promise<void> {
  const kapso = await import('./kapso.js');
  // WhatsApp text limit ~4096; chunk long answers.
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 1500) {
    const cut = rest.lastIndexOf('\n', 1500);
    const idx = cut > 500 ? cut : 1500;
    chunks.push(rest.slice(0, idx));
    rest = rest.slice(idx).trim();
  }
  chunks.push(rest);
  for (const c of chunks) {
    if (c.trim()) await kapso.sendText(phoneNumberId, to, c);
  }
}

async function handleText(
  db: Database,
  contact: Awaited<ReturnType<typeof ensureContact>>,
  rawText: string,
  waMessageId?: string,
): Promise<void> {
  const phoneId = catalogueConfig.phoneNumberId;
  const text = (rawText || '').trim();
  if (!text) {
    await sendAnswer(phoneId, contact.phone, 'I got an empty message. Reply MENU to see what I can help with.');
    return;
  }
  await saveTurn(db, contact.id, 'inbound', text, { waMessageId });

  // 1) Emergency always wins — no LLM.
  if (isEmergency(text) || resolveMenuSelection(text) === 'emergency') {
    await sendEmergency(phoneId, contact.phone);
    await saveTurn(db, contact.id, 'outbound', emergencyReply(), { intent: 'emergency' });
    return;
  }

  // 2) Greeting / menu.
  if (isGreeting(text)) {
    // Keep old catalogue working: if user typed a catalogue number/name previously,
    // new greeting still shows; catalogue fallback happens below for unknown intents.
    await sendGreeting(phoneId, contact.phone);
    await saveTurn(db, contact.id, 'outbound', assistantConfig.greeting, { intent: 'greeting' });
    return;
  }

  // 3) Direct menu selection (numbers, button ids).
  const menuIntent = resolveMenuSelection(text);
  if (menuIntent && /^(\d|menu:.*)$/.test(text.trim().toLowerCase())) {
    if (menuIntent === 'emergency') {
      await sendEmergency(phoneId, contact.phone);
      await saveTurn(db, contact.id, 'outbound', emergencyReply(), { intent: 'emergency' });
      return;
    }
    const direct = staticAnswerFor(menuIntent, text);
    if (direct) {
      await sendAnswer(phoneId, contact.phone, direct.text);
      await saveTurn(db, contact.id, 'outbound', direct.text, { intent: menuIntent, sourceIds: direct.sourceIds });
      return;
    }
    // Otherwise fall through to retrieval with the menu intent.
    const history = await recentTurns(db, contact.id);
    const ans = await answerWithSources(text, { intent: menuIntent, confidence: 1, needsClarification: false, keywords: [], source: 'deterministic' }, { history });
    await sendAnswer(phoneId, contact.phone, ans.text);
    await saveTurn(db, contact.id, 'outbound', ans.text, { intent: ans.intent, sourceIds: ans.sourceIds, llmModel: ans.model });
    return;
  }

  // 4) SUPPORT keyword fast-path (keep old behaviour: "Reply SUPPORT").
  if (/^support$/i.test(text.trim())) {
    const s = staticAnswerFor('support', text)!;
    await sendAnswer(phoneId, contact.phone, s.text);
    await saveTurn(db, contact.id, 'outbound', s.text, { intent: 'support', sourceIds: s.sourceIds });
    return;
  }

  // 5) LLM classification + grounded answer.
  const started = Date.now();
  const classification = await classifyIntent(text);
  if (classification.intent === 'emergency') {
    await sendEmergency(phoneId, contact.phone);
    await saveTurn(db, contact.id, 'outbound', emergencyReply(), { intent: 'emergency' });
    return;
  }
  const history = await recentTurns(db, contact.id);
  const ans = await answerWithSources(text, classification, { history });
  await sendAnswer(phoneId, contact.phone, ans.text);
  await saveTurn(db, contact.id, 'outbound', ans.text, {
    intent: ans.intent,
    sourceIds: ans.sourceIds,
    llmModel: ans.model,
    latencyMs: Date.now() - started,
  });

  // 6) Legacy catalogue fallback: if we had no sources and no LLM, try old exact matching.
  if (!ans.usedLlm && !ans.sourceIds.length && ans.intent === 'unknown') {
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

export async function handleWebhook(request: Request, db: Database, registry: FlowRegistry): Promise<Response> {
  const raw = Buffer.from(await request.arrayBuffer());
  const skipSig = process.env.KAPSO_SKIP_SIGNATURE === 'true' || process.env.KAPSO_WEBHOOK_SECRET === 'sandbox';
  if (!skipSig && !verifyHmac(raw, request.headers.get('x-webhook-signature'), process.env.KAPSO_WEBHOOK_SECRET)) {
    return json({ error: 'Invalid signature' }, 401);
  }
  let payload: KapsoPayload;
  try { payload = JSON.parse(raw.toString('utf8')) as KapsoPayload; } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (payload.phone_number_id && catalogueConfig.phoneNumberId && payload.phone_number_id !== catalogueConfig.phoneNumberId) return json({ ok: true });
  const message = payload.message;
  if (!message?.id || !message.from) return json({ ok: true });
  const eventId = `message:${message.id}`;
  const inserted = await db.query('INSERT INTO webhook_events (id, event_key, payload, received_at) VALUES ($1, $2, $3, $4) ON CONFLICT (event_key) DO NOTHING', [id(), eventId, raw.toString('utf8'), now()]);
  if (!inserted.rowCount) return json({ ok: true });
  const phone = `+${message.from.replace(/^\+/, '')}`;
  const contactName = message.kapso?.contact_name || payload.conversation?.kapso?.contact_name || payload.conversation?.contact_name || 'WhatsApp user';
  const contact = await ensureContact(db, phone, contactName);
  const flowResponse = flowResponseFrom(message);
  if (flowResponse) await registry.dispatch({ ...flowResponse, flowName: flowResponse.flowName || message.kapso?.flow_name }, { phone, contactId: contact.id, flowToken: flowResponse.flowToken || message.kapso?.flow_token, data: flowResponse });
  else await handleText(db, contact, messageText(message), message.id);
  await db.query('UPDATE webhook_events SET processed_at = $1 WHERE event_key = $2', [now(), eventId]);
  return json({ ok: true });
}
