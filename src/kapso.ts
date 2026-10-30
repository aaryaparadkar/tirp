import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

export function createKapsoClient(): WhatsAppClient {
  const apiKey = process.env.KAPSO_API_KEY;
  if (!apiKey) throw new Error('KAPSO_API_KEY is required');
  return new WhatsAppClient({
    baseUrl: 'https://api.kapso.ai/meta/whatsapp',
    kapsoApiKey: apiKey,
  });
}

export interface FlowMessageOptions {
  phoneNumberId: string;
  to: string;
  flowId: string;
  bodyText: string;
  flowCta: string;
  screen?: string;
  data?: Record<string, unknown>;
  flowToken?: string;
}

export async function sendFlow(options: FlowMessageOptions): Promise<unknown> {
  const client = createKapsoClient();
  return client.messages.sendInteractiveFlow({
    phoneNumberId: options.phoneNumberId,
    to: options.to.replace(/^\+/, ''),
    bodyText: options.bodyText,
    parameters: {
      flowId: options.flowId,
      flowCta: options.flowCta,
      flowAction: 'navigate',
      flowActionPayload: {
        screen: options.screen || 'WELCOME',
        data: options.data || {},
      },
      ...(options.flowToken ? { flowToken: options.flowToken } : {}),
    },
  });
}

export async function sendText(phoneNumberId: string, to: string, body: string): Promise<unknown> {
  return createKapsoClient().messages.sendText({ phoneNumberId, to: to.replace(/^\+/, ''), body });
}

/**
 * Format an assistant message for WhatsApp (prose reflow, safe emphasis,
 * bounded length) and send it in WhatsApp-sized chunks. Centralizes the
 * outbound contract so every caller renders consistently.
 */
export async function sendFormattedText(
  phoneNumberId: string,
  to: string,
  body: string,
  opts: { maxChars?: number; chunkLimit?: number } = {},
): Promise<unknown[]> {
  const { formatWhatsAppAnswer, chunkForWhatsApp } = await import('./response-format.js');
  const formatted = formatWhatsAppAnswer(body, { maxChars: opts.maxChars });
  const chunks = chunkForWhatsApp(formatted, opts.chunkLimit ?? 1500).filter((c) => c.trim());
  const results: unknown[] = [];
  for (const chunk of chunks) {
    results.push(await sendText(phoneNumberId, to, chunk));
  }
  return results;
}

export interface MenuButton {
  id: string;
  title: string;
}

export async function sendButtons(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttons: MenuButton[],
  footerText?: string,
): Promise<unknown> {
  // WhatsApp interactive buttons: max 3 per message. Caller should chunk if needed.
  return createKapsoClient().messages.sendInteractiveButtons({
    phoneNumberId,
    to: to.replace(/^\+/, ''),
    bodyText,
    footerText,
    buttons: buttons.slice(0, 3),
  });
}

export async function sendList(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttonText: string,
  sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  footerText?: string,
): Promise<unknown> {
  return createKapsoClient().messages.sendInteractiveList({
    phoneNumberId,
    to: to.replace(/^\+/, ''),
    bodyText,
    buttonText,
    sections,
    footerText,
  });
}

export interface EmergencyButtonOptions {
  /** https URL of the /call/000 bridge page (see emergency-page.ts). */
  callUrl?: string | null;
  /** Button label, max 20 chars on WhatsApp. */
  buttonText?: string;
}

/**
 * Send a one-tap "Call 000" button. Tapping it opens the phone's dialer with
 * 000 pre-typed — it never places the call by itself.
 *
 * WhatsApp CTA-URL buttons need an http(s) URL, so the primary path links to
 * our /call/000 bridge page, which hands off to `tel:000`. The old
 * call-permission message was removed: it asks the user to let the
 * *business* call them, which is the wrong action in an emergency.
 */
export async function sendEmergencyNumber(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  opts: EmergencyButtonOptions = {},
): Promise<unknown> {
  const client = createKapsoClient();
  const normalizedTo = to.replace(/^\+/, '');
  const displayText = (opts.buttonText || 'Call 000').slice(0, 20);
  const send = (url: string) => client.messages.sendInteractiveCtaUrl({
    phoneNumberId,
    to: normalizedTo,
    bodyText,
    footerText: 'Australia emergency: 000',
    parameters: { displayText, url },
  });
  if (opts.callUrl) {
    try {
      return await send(opts.callUrl);
    } catch (error) {
      console.error('[emergency] call-page button failed, trying tel: link', error);
    }
  }
  // Last resort: some clients accept tel: directly. Caller sends plain text if this throws.
  return send('tel:000');
}

export async function sendCallCta(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  displayText: string,
  url: string,
): Promise<unknown> {
  return createKapsoClient().messages.sendInteractiveCtaUrl({
    phoneNumberId,
    to: to.replace(/^\+/, ''),
    bodyText,
    parameters: { displayText, url },
  });
}
