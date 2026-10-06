import type { Database } from './db.js';
import { catalogueConfig } from './config.js';
import { catalogueReply, ensureContact, listCategories, listServices, sendCatalogueFlow, servicesReply } from './catalogue.js';
import { FlowRegistry } from './flows.js';
import { id, json, now, verifyHmac } from './lib.js';
import type { FlowResponse } from './types.js';
import { answerQuiz, handleQuizText } from './quiz/service.js';

interface KapsoMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string }; nfm_reply?: { response_json?: string } };
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

function messageText(message: KapsoMessage): string {
  return (message.text?.body || '').trim();
}

async function handleText(db: Database, contact: Awaited<ReturnType<typeof ensureContact>>, text: string): Promise<void> {
  const normalized = text.toLowerCase();
  if (await handleQuizText(db, contact, text)) return;
  if (await answerQuiz(db, contact, text)) return;
  const categories = await listCategories(db);
  if (/^(hi|hello|hey|start|menu|catalogue|services?)$/.test(normalized)) {
    const body = normalized === 'service' || normalized === 'services' ? servicesReply(await listServices(db)) : catalogueReply(categories);
    const { sendText } = await import('./kapso.js');
    await sendText(catalogueConfig.phoneNumberId, contact.phone, body);
    return;
  }
  const category = categories.find((item, index) => String(index + 1) === normalized || item.name.toLowerCase() === normalized);
  if (category) {
    const { sendText } = await import('./kapso.js');
    await sendText(catalogueConfig.phoneNumberId, contact.phone, servicesReply(await listServices(db, category.id)));
    return;
  }
  const services = await listServices(db);
  const service = services.find((item) => item.name.toLowerCase() === normalized || item.id === normalized);
  if (service) await sendCatalogueFlow(contact, service);
}

export async function handleWebhook(request: Request, db: Database, registry: FlowRegistry): Promise<Response> {
  const raw = Buffer.from(await request.arrayBuffer());
  if (!verifyHmac(raw, request.headers.get('x-webhook-signature'), process.env.KAPSO_WEBHOOK_SECRET)) return json({ error: 'Invalid signature' }, 401);
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
  else await handleText(db, contact, messageText(message));
  await db.query('UPDATE webhook_events SET processed_at = $1 WHERE event_key = $2', [now(), eventId]);
  return json({ ok: true });
}
