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
  phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID || '',
  flowId: process.env.OSHC_FLOW_ID,
};
