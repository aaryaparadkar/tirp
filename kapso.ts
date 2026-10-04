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
