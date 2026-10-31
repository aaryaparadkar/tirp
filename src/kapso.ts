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

/** WhatsApp interactive limits (Cloud API). */
export const WA_LIMITS = { rowTitle: 24, rowDescription: 72, buttonTitle: 20, listButton: 20, sectionTitle: 24, footer: 60, body: 1024 } as const;

/**
 * Fit text to a WhatsApp field limit without cutting mid-word:
 * "Find healthcare / providers" → "Find healthcare…", never "Find healthcare / provid".
 * Labels should already fit; this is the safety net.
 */
export function fitTitle(text: string, max: number): string {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  const chars = [...value]; // count code points, not UTF-16 units (CJK/emoji)
  if (chars.length <= max) return value;
  const cut = chars.slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  const base = space >= Math.floor(max / 3) ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s/&,.:;–—-]+$/u, '')}…`;
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
    footerText: footerText ? fitTitle(footerText, WA_LIMITS.footer) : undefined,
    buttons: buttons.slice(0, 3).map((b) => ({ ...b, title: fitTitle(b.title, WA_LIMITS.buttonTitle) })),
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
    buttonText: fitTitle(buttonText, WA_LIMITS.listButton),
    sections: sections.map((section) => ({
      ...section,
      ...(section.title ? { title: fitTitle(section.title, WA_LIMITS.sectionTitle) } : {}),
      rows: section.rows.map((row) => ({
        ...row,
        title: fitTitle(row.title, WA_LIMITS.rowTitle),
        ...(row.description ? { description: fitTitle(row.description, WA_LIMITS.rowDescription) } : {}),
      })),
    })),
    footerText: footerText ? fitTitle(footerText, WA_LIMITS.footer) : undefined,
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
