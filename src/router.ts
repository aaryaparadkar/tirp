import { assistantConfig, mistralConfig } from './config.js';
import { cachedKbChunks } from './kb/loader.js';
import { formatSources, retrieve } from './kb/index.js';
import { REWARDS_DESTINATION, SUPPORT_DESTINATIONS, UPDATES_DESTINATIONS } from './kb/sources.js';
import { answerMessages, classifierMessages, VALID_INTENTS } from './llm/prompts.js';
import { mistralChat } from './llm/mistral.js';
import type { AssistantAnswer, ConversationTurn, Intent, IntentClassification, KbChunk } from './types.js';

export const MENU_OPTIONS: Array<{ key: string; intent: Intent; label: string; description: string }> = [
  { key: '1', intent: 'coverage', label: 'Understand my OSHC cover', description: 'Essentials vs Comprehensive inclusions' },
  { key: '2', intent: 'claims', label: 'Claims and reimbursements', description: 'How to claim and get paid back' },
  { key: '3', intent: 'providers', label: 'Find healthcare / providers', description: 'GPs, direct billing, hospitals' },
  { key: '4', intent: 'pharmacy', label: 'Pharmacy and medicines', description: 'Prescriptions and limits' },
  { key: '5', intent: 'visa_compliance', label: 'Visa and waiting periods', description: 'Subclass 500 and waiting times' },
  { key: '6', intent: 'student_rewards', label: 'Student rewards', description: 'Rewards and benefits' },
  { key: '7', intent: 'updates', label: 'Important updates', description: 'Current Medibank updates' },
  { key: '8', intent: 'forms_and_guides', label: 'Forms and member guides', description: 'Forms, PDFs, cover summaries' },
  { key: '9', intent: 'emergency', label: 'Urgent health / accident', description: 'Call 000 immediately' },
];

const BUTTON_TO_INTENT: Record<string, Intent> = {
  'menu:coverage': 'coverage',
  'menu:claims': 'claims',
  'menu:reimbursements': 'reimbursements',
  'menu:providers': 'providers',
  'menu:healthcare': 'healthcare_navigation',
  'menu:pharmacy': 'pharmacy',
  'menu:visa': 'visa_compliance',
  'menu:waiting': 'waiting_periods',
  'menu:rewards': 'student_rewards',
  'menu:updates': 'updates',
  'menu:forms': 'forms_and_guides',
  'menu:support': 'support',
  'menu:emergency': 'emergency',
  'menu:greeting': 'greeting',
};

export function resolveMenuSelection(text: string): Intent | null {
  const t = (text || '').trim().toLowerCase();
  if (BUTTON_TO_INTENT[t]) return BUTTON_TO_INTENT[t];
  const num = t.replace(/^[^\d]*(\d)[^\d]*$/, '$1');
  const found = MENU_OPTIONS.find((o) => o.key === t || o.key === num);
  if (found) return found.intent;
  // Friendly phrases
  if (/^(cover|coverage|my cover|understand.*cover)/.test(t)) return 'coverage';
  if (/^(claim|claims|reimburse|refund)/.test(t)) return 'claims';
  if (/reward|perk|benefit/.test(t)) return 'student_rewards';
  if (/update|news|announcement/.test(t)) return 'updates';
  if (/form|guide|brochure|pdf/.test(t)) return 'forms_and_guides';
  if (/visa/.test(t)) return 'visa_compliance';
  if (/waiting/.test(t)) return 'waiting_periods';
  if (/pharmacy|medicine|prescription/.test(t)) return 'pharmacy';
  if (/doctor|gp|hospital|clinic|provider|direct billing/.test(t)) return 'providers';
  if (/support|contact|human|person|help/.test(t)) return 'support';
  return null;
}

export function deterministicClassify(text: string): IntentClassification | null {
  const t = (text || '').toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  if (!t.trim()) return null;
  if (has('000', 'ambulance', 'unconscious', "can't breathe", 'cannot breathe', 'bleeding heavily', 'chest pain', 'had an accident', 'seriously injured', 'overdose')) {
    return { intent: 'emergency', confidence: 0.95, needsClarification: false, keywords: ['emergency'], source: 'deterministic' };
  }
  if (has('reward', 'livebetter', 'live better', 'perk', 'student plus')) {
    return { intent: 'student_rewards', confidence: 0.9, needsClarification: false, keywords: ['rewards'], source: 'deterministic' };
  }
  if (has('waiting period', 'waiting time', 'pre-existing', 'pre existing', 'how long until covered')) {
    return { intent: 'waiting_periods', confidence: 0.9, needsClarification: false, keywords: ['waiting'], source: 'deterministic' };
  }
  if (has('visa', 'subclass 500', 'condition 8501', 'student visa requirement')) {
    return { intent: 'visa_compliance', confidence: 0.9, needsClarification: false, keywords: ['visa'], source: 'deterministic' };
  }
  if (has('direct billing', 'find a doctor', 'find doctor', 'find gp', 'find a gp', 'nearby clinic', 'members choice', "members' choice", 'provider')) {
    return { intent: 'providers', confidence: 0.88, needsClarification: false, keywords: ['provider'], source: 'deterministic' };
  }
  if (has('pharmacy', 'prescription', 'medicine', 'medicines', 'pbs', 'over-the-counter', 'drug cost')) {
    return { intent: 'pharmacy', confidence: 0.88, needsClarification: false, keywords: ['pharmacy'], source: 'deterministic' };
  }
  if (has('reimburse', 'reimbursement', 'refund', 'paid back', 'get my money back', 'bank account payment')) {
    return { intent: 'reimbursements', confidence: 0.88, needsClarification: false, keywords: ['reimbursement'], source: 'deterministic' };
  }
  if (has('claim', 'receipt', 'invoice', 'claim form', 'online member services', 'how to claim')) {
    return { intent: 'claims', confidence: 0.9, needsClarification: false, keywords: ['claim'], source: 'deterministic' };
  }
  if (has('form', 'brochure', 'member guide', 'cover summary', 'pdf', 'download')) {
    return { intent: 'forms_and_guides', confidence: 0.85, needsClarification: false, keywords: ['forms'], source: 'deterministic' };
  }
  if (has('essentials', 'comprehensive', 'what is covered', "what's covered", 'is dental covered', 'is optical covered', 'hospital cover', 'extras cover', 'out-of-pocket', 'out of pocket', 'mbs')) {
    return { intent: 'coverage', confidence: 0.87, needsClarification: false, keywords: ['coverage'], source: 'deterministic' };
  }
  if (has('gp', 'sick', 'cold', 'fever', 'hospital', 'seeing a doctor', 'healthcare', 'health system', 'medicare')) {
    return { intent: 'healthcare_navigation', confidence: 0.8, needsClarification: false, keywords: ['healthcare'], source: 'deterministic' };
  }
  if (has('update', 'news', 'announcement', 'change to cover', 'new benefit')) {
    return { intent: 'updates', confidence: 0.8, needsClarification: false, keywords: ['updates'], source: 'deterministic' };
  }
  if (has('contact', 'support', 'human', 'speak to someone', 'call medibank', 'phone number', 'store near')) {
    return { intent: 'support', confidence: 0.85, needsClarification: false, keywords: ['support'], source: 'deterministic' };
  }
  return null;
}

export async function classifyIntent(
  text: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<IntentClassification> {
  const menu = resolveMenuSelection(text);
  // Single digit / button selections are authoritative.
  if (menu && /^(\d|menu:.*)$/.test(text.trim().toLowerCase())) {
    return { intent: menu, confidence: 1, needsClarification: false, keywords: [menu], source: 'deterministic' };
  }
  const det = deterministicClassify(text);
  if (det && det.confidence >= 0.85) return det;

  const cfg = mistralConfig();
  if (cfg.keys.length) {
    const res = await mistralChat(classifierMessages(text), {
      jsonMode: true,
      maxTokens: cfg.maxTokensClassify,
      temperature: 0,
      fetchImpl: opts.fetchImpl,
    });
    if (res.ok) {
      try {
        const parsed = JSON.parse(res.text) as {
          intent?: string;
          sub_intent?: string;
          confidence?: number;
          needs_clarification?: boolean;
          keywords?: string[];
        };
        const intent = (parsed.intent || 'unknown') as Intent;
        if (VALID_INTENTS.includes(intent)) {
          return {
            intent,
            subIntent: typeof parsed.sub_intent === 'string' ? parsed.sub_intent : undefined,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
            needsClarification: Boolean(parsed.needs_clarification),
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 6).map(String) : [],
            source: 'llm',
          };
        }
      } catch {
        // fall through to deterministic fallback
      }
    }
  }
  if (det) return det;
  return { intent: 'unknown', confidence: 0.3, needsClarification: true, keywords: [], source: 'fallback' };
}

export function staticAnswerFor(intent: Intent, question: string): AssistantAnswer | null {
  switch (intent) {
    case 'greeting':
      return { text: assistantConfig.greeting, intent, sourceIds: [], sourceUrls: [], usedLlm: false };
    case 'student_rewards':
      return {
        text:
          `Student rewards can change, so I only use the official page.\n\n` +
          `${REWARDS_DESTINATION.title}: ${REWARDS_DESTINATION.url}\n` +
          `${REWARDS_DESTINATION.note}\n\n` +
          `Tell me if you want help understanding whether rewards affect your OSHC hospital/medical cover (they don't replace OSHC cover).`,
        intent,
        sourceIds: ['livebetter-rewards'],
        sourceUrls: [REWARDS_DESTINATION.url],
        usedLlm: false,
      };
    case 'updates':
      return {
        text:
          `I don't invent current offers or policy changes. Check these official sources:\n\n` +
          UPDATES_DESTINATIONS.map((d) => `${d.title}: ${d.url}`).join('\n') +
          `\n\nTell me what update you heard about (e.g. price, cover change, app change) and I'll explain how to verify it for your policy.`,
        intent,
        sourceIds: ['official-updates'],
        sourceUrls: UPDATES_DESTINATIONS.map((d) => d.url),
        usedLlm: false,
      };
    case 'support':
      return {
        text:
          `Here's how to reach a person:\n\n` +
          SUPPORT_DESTINATIONS.map((d) => `${d.title}: ${d.url}`).join('\n') +
          `\nPhone: Medibank OSHC 134 148 | 24/7 Student Health and Support Line 1800 887 283\n\n${assistantConfig.disclaimer}`,
        intent,
        sourceIds: ['support'],
        sourceUrls: SUPPORT_DESTINATIONS.map((d) => d.url),
        usedLlm: false,
      };
    case 'forms_and_guides':
      if (/claim/i.test(question)) {
        return {
          text:
            `For OSHC claims use the online paths first:\n` +
            `• Online Member Services: https://www.members.medibankoshc.com.au/login.html\n` +
            `• Online claim form: https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
            `• Mail: Medibank OSHC, GPO 2984 Melbourne Vic 3001 (with claim form + receipts)\n` +
            `• In-store: any Medibank store with receipts\n\n` +
            `Other forms/brochures: https://www.medibank.com.au/health-insurance/using-your-cover/brochures-forms/\n` +
            `OSHC info: https://www.medibankoshc.com.au/oshc-support/oshc-information/`,
          intent,
          sourceIds: ['13-oshc-online-claims.md', '19-forms-and-brochures.md'],
          sourceUrls: [
            'https://www.medibankoshc.com.au/how-to-make-an-online-claim/',
            'https://www.medibank.com.au/health-insurance/using-your-cover/brochures-forms/',
          ],
          usedLlm: false,
        };
      }
      return null;
    default:
      return null;
  }
}

export async function answerWithSources(
  question: string,
  classification: IntentClassification,
  opts: { chunks?: KbChunk[]; history?: ConversationTurn[]; fetchImpl?: typeof fetch } = {},
): Promise<AssistantAnswer> {
  const staticAns = staticAnswerFor(classification.intent, question);
  // Prefer deterministic links for rewards/updates/support/greeting; still allow
  // LLM to expand ONLY if retrieval is available — but never invent offers.
  if (staticAns && ['greeting', 'student_rewards', 'updates', 'support'].includes(classification.intent)) {
    return staticAns;
  }

  const chunks = opts.chunks || (await cachedKbChunks().catch(() => [] as KbChunk[]));
  const results = retrieve(chunks, `${question} ${(classification.keywords || []).join(' ')}`, classification.intent, 4);
  const { ids, urls } = formatSources(results);

  const cfg = mistralConfig();
  if (cfg.keys.length && results.length) {
    const res = await mistralChat(answerMessages(question, classification.intent, results, opts.history || []), {
      maxTokens: cfg.maxTokensAnswer,
      temperature: 0.2,
      fetchImpl: opts.fetchImpl,
    });
    if (res.ok) {
      const text = res.text.length > 1800 ? `${res.text.slice(0, 1750)}…` : res.text;
      return { text: `${text}\n\n${assistantConfig.disclaimer}`, intent: classification.intent, sourceIds: ids, sourceUrls: urls, usedLlm: true, model: res.model };
    }
  }

  // Deterministic fallback: extractive summary from retrieved chunks.
  if (results.length) {
    const top = results.slice(0, 2);
    const body = top
      .map((r) => r.chunk.content.slice(0, 600).trim())
      .join('\n\n---\n\n');
    return {
      text:
        `Here's what Medibank OSHC sources say (general info only):\n\n${body}\n\n` +
        `Sources:\n${urls.join('\n')}\n\n${assistantConfig.disclaimer}\n` +
        `If this doesn't answer it, reply SUPPORT or call 134 148.`,
      intent: classification.intent,
      sourceIds: ids,
      sourceUrls: urls,
      usedLlm: false,
    };
  }

  if (staticAns) return staticAns;
  return {
    text:
      `I couldn't find that in the Medibank OSHC sources I have. ` +
      `Try asking about cover, claims, providers, pharmacy, visa, waiting periods, rewards, forms, or reply MENU.\n\n` +
      `For personal help: https://www.medibankoshc.com.au/contact-us/ or 134 148.`,
    intent: classification.intent,
    sourceIds: [],
    sourceUrls: [],
    usedLlm: false,
  };
}
