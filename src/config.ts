try {
  process.loadEnvFile?.();
} catch {}

export interface CatalogueConfig {
  brandName: string;
  greeting: string;
  supportText: string;
  phoneNumberId: string;
  flowId?: string;
}

export const catalogueConfig: CatalogueConfig = {
  brandName: 'OSHC',
  greeting: 'Welcome to OSHC. I can help you find the right health cover service.',
  supportText: 'Reply SUPPORT if you need help from the OSHC team.',
  get phoneNumberId(): string {
    return process.env.KAPSO_PHONE_NUMBER_ID || '';
  },
  get flowId(): string | undefined {
    return process.env.OSHC_FLOW_ID;
  },
};
