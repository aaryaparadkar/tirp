export interface CatalogueConfig {
  brandName: string;
  greeting: string;
  supportText: string;
  phoneNumberId: string;
  flowId?: string;
}

function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export const catalogueConfig: CatalogueConfig = {
  brandName: 'Medibank OSHC',
  greeting: 'Welcome to OSHC. I can help you find the right health cover service.',
  supportText: 'Reply SUPPORT if you need help from the OSHC team.',
  phoneNumberId: env('KAPSO_PHONE_NUMBER_ID'),
  flowId: process.env.OSHC_FLOW_ID,
};

export const EMERGENCY_NUMBER_AU = '000';
export const STUDENT_SUPPORT_LINE = '1800 887 283';
export const OSHC_GENERAL_LINE = '134 148';

export const assistantConfig = {
  greeting:
    `Hi, I'm the Medibank OSHC student assistant. I can help you with:\n\n` +
    `1. Understanding your OSHC cover (Essentials vs Comprehensive)\n` +
    `2. Claims and reimbursements\n` +
    `3. Finding healthcare and direct-billing providers\n` +
    `4. Pharmacy and medicines\n` +
    `5. Visa requirements and waiting periods\n` +
    `6. Student rewards and benefits\n` +
    `7. Important Medibank updates\n` +
    `8. Forms and member guides\n` +
    `9. Urgent health issues or accidents\n\n` +
    `Reply with a number (1-9), tap an option, or just type your question.\n` +
    `I give general information from Medibank OSHC sources only — I can't diagnose conditions or confirm your individual claim outcome.`,
  disclaimer:
    'General information only, from Medibank OSHC sources. Not medical advice. For personal cover or claim decisions, contact Medibank OSHC.',
  supportText:
    'Need a person? Call Medibank OSHC on 134 148, the 24/7 Student Health and Support Line on 1800 887 283, or message via https://www.medibankoshc.com.au/contact-us/',
};

export interface MistralConfig {
  keys: string[];
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  maxTokensClassify: number;
  maxTokensAnswer: number;
}

export function mistralKeys(): string[] {
  const raw = env('MISTRAL_API_KEYS') || env('MISTRAL_API_KEY');
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

export function mistralConfig(): MistralConfig {
  return {
    keys: mistralKeys(),
    model: env('MISTRAL_MODEL', 'mistral-small-latest'),
    baseUrl: (env('MISTRAL_BASE_URL', 'https://api.mistral.ai/v1') || 'https://api.mistral.ai/v1').replace(/\/$/, ''),
    timeoutMs: Number(process.env.MISTRAL_TIMEOUT_MS || 15000),
    maxRetries: Number(process.env.MISTRAL_MAX_RETRIES || 2),
    maxTokensClassify: Number(process.env.MISTRAL_MAX_TOKENS_CLASSIFY || 400),
    maxTokensAnswer: Number(process.env.MISTRAL_MAX_TOKENS_ANSWER || 800),
  };
}
