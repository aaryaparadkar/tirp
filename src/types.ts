export interface CatalogueCategory {
  id: string;
  name: string;
  description: string;
}

export interface CatalogueService {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  flowName?: string;
  flowId?: string;
  actionLabel?: string;
}

export type SupportedLanguage = 'en' | 'zh-CN' | 'es';

export interface Contact {
  id: string;
  phone: string;
  name: string;
  locale: string;
  preferredLanguage?: SupportedLanguage | null;
  optedIn: boolean;
}

export interface FlowResponse {
  flowToken?: string;
  flowName?: string;
  [key: string]: unknown;
}

export type Intent =
  | 'greeting'
  | 'coverage'
  | 'claims'
  | 'reimbursements'
  | 'healthcare_navigation'
  | 'providers'
  | 'pharmacy'
  | 'medicines'
  | 'visa_compliance'
  | 'waiting_periods'
  | 'student_rewards'
  | 'updates'
  | 'forms_and_guides'
  | 'support'
  | 'emergency'
  | 'unknown';

export interface IntentClassification {
  intent: Intent;
  subIntent?: string;
  confidence: number;
  needsClarification: boolean;
  keywords: string[];
  source: 'deterministic' | 'llm' | 'fallback';
}

export interface KbSource {
  file: string;
  title: string;
  url: string;
  intents: Intent[];
  description: string;
}

export interface KbChunk {
  id: string;
  file: string;
  title: string;
  url: string;
  heading: string;
  content: string;
}

export interface RetrievalResult {
  chunk: KbChunk;
  score: number;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  body: string;
}

export interface AssistantAnswer {
  text: string;
  intent: Intent;
  language: SupportedLanguage;
  sourceIds: string[];
  sourceUrls: string[];
  usedLlm: boolean;
  model?: string;
}
