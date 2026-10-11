import type { ConversationTurn, Intent, RetrievalResult, SupportedLanguage } from '../types.js';
import type { ChatMessage } from './mistral.js';

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  'zh-CN': 'Simplified Chinese (简体中文)',
  es: 'Spanish (español)',
};

export const VALID_INTENTS: Intent[] = [
  'greeting',
  'coverage',
  'claims',
  'reimbursements',
  'healthcare_navigation',
  'providers',
  'pharmacy',
  'medicines',
  'visa_compliance',
  'waiting_periods',
  'student_rewards',
  'updates',
  'forms_and_guides',
  'support',
  'emergency',
  'unknown',
];

export function classifierMessages(text: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are an intent classifier for a Medibank OSHC student WhatsApp assistant. ' +
        'The user may write in English, Simplified Chinese, or Spanish. Classify intent regardless of language. ' +
        'Return STRICT JSON only with keys: intent, sub_intent, confidence, needs_clarification, keywords. ' +
        `Valid intents: ${VALID_INTENTS.join(', ')}. ` +
        'Use "claims" for how-to-claim questions, "reimbursements" for money-back/payment/refund questions, ' +
        '"coverage" for what is included/excluded, "providers" for find-a-doctor/clinic/direct-billing, ' +
        '"healthcare_navigation" for GP/hospital/what-to-do-when-sick, "pharmacy"/"medicines" for prescriptions, ' +
        '"visa_compliance" for student visa health requirements, "waiting_periods" for waiting times, ' +
        '"student_rewards" for rewards/perks, "updates" for news/changes, "forms_and_guides" for forms/PDFs/guides, ' +
        '"support" for contacting a human, "emergency" ONLY for immediate danger/urgent medical help, ' +
        'otherwise "unknown". confidence is 0-1. keywords is up to 6 lowercase terms (English keywords preferred for retrieval).',
    },
    { role: 'user', content: text.slice(0, 1500) },
  ];
}

export function answerMessages(
  question: string,
  intent: Intent,
  results: RetrievalResult[],
  history: ConversationTurn[] = [],
  language: SupportedLanguage = 'en',
): ChatMessage[] {
  const sources = results
    .map((r, i) => `[S${i + 1}] file=${r.chunk.file} title=${r.chunk.title} heading=${r.chunk.heading} url=${r.chunk.url}\n${r.chunk.content.slice(0, 2200)}`)
    .join('\n\n');
  const historyText = history
    .slice(-6)
    .map((t) => `${t.role.toUpperCase()}: ${t.body.slice(0, 500)}`)
    .join('\n');
  const langName = LANGUAGE_NAMES[language];
  return [
    {
      role: 'system',
      content:
        'You are a Medibank OSHC student assistant. Answer ONLY from the supplied SOURCES. ' +
        `The user language is: ${language} (${langName}). Answer only in that language. ` +
        (language === 'zh-CN'
          ? 'Use Simplified Chinese. Keep official URLs, phone numbers, product names (Essentials OSHC, Comprehensive OSHC), and policy identifiers unchanged. '
          : language === 'es'
            ? 'Use standard international Spanish. Keep official URLs, phone numbers, product names (Essentials OSHC, Comprehensive OSHC), and policy identifiers unchanged. '
            : 'Answer in English. ') +
        'Do not switch languages even if the source material is English. Do not mix languages except for official names and URLs. ' +
        'Rules: do not invent benefits, limits, waiting periods, phone numbers, or URLs. ' +
        'Distinguish Essentials OSHC vs Comprehensive OSHC. If the answer depends on the exact policy, say so. ' +
        'Mention possible out-of-pocket costs where relevant. Keep WhatsApp answers under ~700 characters when possible. ' +
        'End with "Sources:" (or 资料来源： / Fuentes:) followed by the source URLs you actually used. ' +
        'If sources are insufficient, say what is missing and direct the user to Medibank OSHC support (134 148 / https://www.medibankoshc.com.au/contact-us/). ' +
        'No diagnosis. No personal claim approval predictions. General information only.',
    },
    {
      role: 'user',
      content:
        `Intent: ${intent}\nUser language: ${language}\nQuestion: ${question.slice(0, 1500)}\n` +
        (historyText ? `Recent conversation:\n${historyText}\n\n` : '') +
        `SOURCES:\n${sources || '(no sources retrieved)'}`,
    },
  ];
}
