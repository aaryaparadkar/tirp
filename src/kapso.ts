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

export async function sendEmergencyNumber(phoneNumberId: string, to: string, bodyText: string): Promise<unknown> {
  const client = createKapsoClient();
  const normalizedTo = to.replace(/^\+/, '');
  // Prefer native call-permission request so the user gets a Call button.
  // 000 is Australia's emergency number; WhatsApp/Kapso may restrict this,
  // so callers must also send a tel: fallback text (handled by webhook layer).
  try {
    await client.messages.sendInteractiveCallPermission({
      phoneNumberId,
      to: normalizedTo,
      bodyText,
      footerText: "Australia emergency: 000",
      parameters: { phoneNumber: '000', callPurpose: 'Emergency help' },
    });
    return { callPermissionSent: true };
  } catch {
    // Fall back to CTA URL button with tel: link.
    return client.messages.sendInteractiveCtaUrl({
      phoneNumberId,
      to: normalizedTo,
      bodyText,
      footerText: "Australia emergency: 000",
      parameters: { displayText: 'Call 000 now', url: 'tel:000' },
    });
  }
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
