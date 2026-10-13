import { mistralConfig } from './config.js';
import { t } from './i18n.js';
import { canonicalizeForMatch, containsCommandVariant, expandQueryWithAliases, fuzzyContainsAny, normalizeInput, resolveCommandAlias } from './input-normalization.js';
import { cachedKbChunks } from './kb/loader.js';
import { formatSources, retrieve } from './kb/index.js';
import { REWARDS_DESTINATION, UPDATES_DESTINATIONS } from './kb/sources.js';
import { answerMessages, classifierMessages, VALID_INTENTS } from './llm/prompts.js';
import { mistralChat } from './llm/mistral.js';
import { formatWhatsAppAnswer } from './response-format.js';
import type { AssistantAnswer, ConversationTurn, Intent, IntentClassification, KbChunk, SupportedLanguage } from './types.js';

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
  const raw = normalizeInput(text);
  const c = canonicalizeForMatch(raw);
  if (!c) return null;
  const lowerRaw = raw.trim().toLowerCase();
  if (BUTTON_TO_INTENT[lowerRaw]) return BUTTON_TO_INTENT[lowerRaw];
  const num = c.replace(/^[^\d]*(\d)[^\d]*$/, '$1');
  const found = MENU_OPTIONS.find((o) => o.key === c || o.key === num);
  if (found) return found.intent;
  // Single-word command typos (menu/help/support/claim/cover/...).
  // Note: menu option 2 covers claims + reimbursements, so both map to 'claims' here.
  const alias = resolveCommandAlias(c);
  if (alias === 'claim') return 'claims';
  if (alias === 'reimbursement') return 'claims';
  if (alias === 'cover') return 'coverage';
  if (alias === 'pharmacy') return 'pharmacy';
  if (alias === 'provider') return 'providers';
  if (alias === 'visa') return 'visa_compliance';
  if (alias === 'support' || alias === 'help') return 'support';
  if (alias === 'emergency') return 'emergency';
  // Friendly phrases (EN + ES + ZH keywords), typo-tolerant for Latin scripts.
  // Known typo variants also match inside longer sentences (e.g. "how do I cliam?").
  if (/^(cover|coverage|my cover|understand.*cover)/.test(c) || fuzzyContainsAny(c, ['cover', 'coverage', 'cobertura']) || containsCommandVariant(c, 'cover')) return 'coverage';
  if (/保障|保障范围|包括什么/.test(raw)) return 'coverage';
  if (/^(claim|claims|reimburse|refund|reembolso)/.test(c) || fuzzyContainsAny(c, ['claim', 'claims', 'reimburse', 'refund', 'reimbursement', 'reclamo', 'reclamacion', 'reembolso']) || containsCommandVariant(c, 'claim') || containsCommandVariant(c, 'reimbursement')) return 'claims';
  if (/理赔|报销|索赔/.test(raw)) return 'claims';
  if (fuzzyContainsAny(c, ['reward', 'rewards', 'perk', 'benefit', 'recompensa', 'beneficio'])) return 'student_rewards';
  if (/奖励|福利|优惠/.test(raw)) return 'student_rewards';
  if (fuzzyContainsAny(c, ['update', 'updates', 'news', 'announcement', 'actualizacion', 'actualización'])) return 'updates';
  if (/更新|通知|最新/.test(raw)) return 'updates';
  if (fuzzyContainsAny(c, ['form', 'forms', 'guide', 'brochure', 'pdf', 'download', 'formulario', 'folleto', 'guia'])) return 'forms_and_guides';
  if (/表格|指南|手册|下载/.test(raw)) return 'forms_and_guides';
  if (fuzzyContainsAny(c, ['visa', 'visado', 'subclass'])) return 'visa_compliance';
  if (/签证/.test(raw)) return 'visa_compliance';
  if (fuzzyContainsAny(c, ['waiting', 'espera'])) return 'waiting_periods';
  if (/等待期|等待时间/.test(raw)) return 'waiting_periods';
  if (fuzzyContainsAny(c, ['pharmacy', 'medicine', 'medicines', 'prescription', 'farmacia', 'medicamento'])) return 'pharmacy';
  if (/药房|处方|药品|药物/.test(raw)) return 'pharmacy';
  if (fuzzyContainsAny(c, ['doctor', 'hospital', 'clinic', 'provider', 'medico', 'clinica', 'proveedor'])) return 'providers';
  if (/direct billing/.test(c) || /facturacion directa/.test(c)) return 'providers';
  if (/医生|诊所|医院|直付|医疗机构/.test(raw)) return 'providers';
  if (fuzzyContainsAny(c, ['support', 'contact', 'human', 'person', 'help', 'ayuda', 'contacto', 'soporte', 'persona']) || containsCommandVariant(c, 'support') || containsCommandVariant(c, 'help')) return 'support';
  if (/客服|人工|联系|帮助/.test(raw)) return 'support';
  return null;
}

/**
 * Deterministic intent classification with explicit rule priority.
 *
 * Priority is load-bearing: money questions (claims/reimbursements) and
 * coverage questions must win over bare facility words like "hospital",
 * and care-seeking ("what should I do, I feel sick") must win over
 * location lookup ("find a doctor near me"). Providers only fires with a
 * location-seeking signal so "Can I claim my hospital bill?" routes to
 * claims, not providers.
 */
const LOCATION_SIGNAL =
  /find|near|nearby|near me|around me|direct billing|members.? ?choice|address|location|book\s+(a\s+)?(doctor|gp|clinic|appointment)|open\s+(late|weekend|now)|which\s+(clinic|doctor|gp|hospital)/;
const CARE_ACTION =
  /what\s+(should|do)\s+i\s+do|feel.*sick|i.*\bsick\b|\bfever\b|\bflu\b|symptoms|feel\s+unwell|health\s+system|medicare|seeing\s+a\s+doctor.*(sick|ill)|sick.*doctor/;

export function deterministicClassify(text: string): IntentClassification | null {
  const raw = normalizeInput(text || '');
  const t = raw.toLowerCase();
  const c = canonicalizeForMatch(raw);
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  const hasFuzzy = (...words: string[]) => fuzzyContainsAny(c, words);
  const hasRaw = (...words: string[]) => words.some((w) => raw.includes(w));
  if (!t.trim()) return null;
  if (
    has('000', 'ambulance', 'unconscious', "can't breathe", 'cannot breathe', 'bleeding heavily', 'chest pain', 'had an accident', 'seriously injured', 'overdose') ||
    has('emergencia', 'ambulancia', 'inconsciente', 'no puedo respirar', 'sangrado grave', 'dolor en el pecho', 'accidente grave', 'tuve un accidente') ||
    hasRaw('救命', '紧急', '救护车', '呼吸困难', '不能呼吸', '失去意识', '昏倒', '严重出血', '胸痛', '出事故', '车祸', '有人受伤')
  ) {
    return { intent: 'emergency', confidence: 0.95, needsClarification: false, keywords: ['emergency'], source: 'deterministic', rule: 'emergency-keywords' };
  }
  if (has('reward', 'livebetter', 'live better', 'perk', 'student plus', 'recompensa', 'beneficio') || hasFuzzy('reward', 'rewards', 'recompensa', 'beneficio') || hasRaw('奖励', '福利', '优惠', '学生奖励')) {
    return { intent: 'student_rewards', confidence: 0.9, needsClarification: false, keywords: ['rewards'], source: 'deterministic', rule: 'rewards' };
  }
  if (has('waiting period', 'waiting time', 'pre-existing', 'pre existing', 'how long until covered', 'período de espera', 'periodo de espera') || hasFuzzy('waiting', 'espera') || hasRaw('等待期', '等待时间')) {
    return { intent: 'waiting_periods', confidence: 0.9, needsClarification: false, keywords: ['waiting'], source: 'deterministic', rule: 'waiting-periods' };
  }
  if (has('visa', 'visado', 'subclass 500', 'condition 8501', 'student visa requirement') || hasFuzzy('visa', 'visado', 'subclass') || hasRaw('签证', '500签证')) {
    return { intent: 'visa_compliance', confidence: 0.9, needsClarification: false, keywords: ['visa'], source: 'deterministic', rule: 'visa' };
  }
  // Care-seeking beats fuzzy coverage/location matches ("fever" is close to
  // "cover" by edit distance). Money questions defer to the money rules below.
  if (
    CARE_ACTION.test(t) ||
    has('sick', 'cold', 'fever', 'seeing a doctor', 'healthcare', 'health system', 'medicare', 'enfermo', 'fiebre', 'salud', 'feel unwell', 'symptoms') ||
    /\bgp\b/.test(t) ||
    hasRaw('生病', '感冒', '发烧', '医疗')
  ) {
    const moneySignal = has('claim', 'reimburse', 'refund', 'money back', 'paid back', 'get paid', 'cover', 'billing', 'bill', 'cost', 'price') || hasRaw('报销', '理赔', '退款', '收据', '发票', '费用');
    if (!moneySignal && !LOCATION_SIGNAL.test(t)) {
      return { intent: 'healthcare_navigation', confidence: 0.82, needsClarification: false, keywords: ['healthcare'], source: 'deterministic', rule: 'healthcare-action' };
    }
  }
  // Medicine context wins over generic money-back phrasing ("处方药可以报销吗").
  if (has('pharmacy', 'prescription', 'medicine', 'medicines', 'pbs', 'over-the-counter', 'drug cost', 'farmacia', 'medicamento', 'receta') || hasFuzzy('pharmacy', 'prescription', 'medicine', 'medicines', 'farmacia', 'medicamento', 'receta') || hasRaw('药房', '处方', '药品', '药物')) {
    return { intent: 'pharmacy', confidence: 0.88, needsClarification: false, keywords: ['pharmacy'], source: 'deterministic', rule: 'pharmacy' };
  }
  // Money-back specificity: "when do I get paid" beats generic "claim".
  if (has('reimburse', 'reimbursement', 'refund', 'paid back', 'get my money back', 'bank account payment', 'reembolso', 'money back', 'when will i be paid') || hasFuzzy('reimburse', 'reimbursement', 'refund', 'reembolso') || containsCommandVariant(c, 'reimbursement') || hasRaw('报销', '退款', '拿回费用')) {
    return { intent: 'reimbursements', confidence: 0.88, needsClarification: false, keywords: ['reimbursement'], source: 'deterministic', rule: 'reimbursements' };
  }
  if (has('claim', 'receipt', 'invoice', 'claim form', 'online member services', 'how to claim', 'reclamo', 'reclamación', 'recibo') || hasFuzzy('claim', 'claims', 'reclamo', 'receipt', 'invoice') || containsCommandVariant(c, 'claim') || hasRaw('理赔', '索赔', '收据', '发票')) {
    return { intent: 'claims', confidence: 0.9, needsClarification: false, keywords: ['claim'], source: 'deterministic', rule: 'claims' };
  }
  if (has('form', 'brochure', 'member guide', 'cover summary', 'pdf', 'download', 'formulario', 'folleto', 'guía', 'guia') || hasFuzzy('form', 'forms', 'brochure', 'guide', 'formulario', 'folleto') || hasRaw('表格', '指南', '手册', '下载', '保障摘要')) {
    return { intent: 'forms_and_guides', confidence: 0.85, needsClarification: false, keywords: ['forms'], source: 'deterministic', rule: 'forms' };
  }
  // Coverage needs a coverage signal — bare "hospital" alone is not coverage.
  if (
    has('essentials', 'comprehensive', 'what is covered', "what's covered", 'is dental covered', 'is optical covered', 'hospital cover', 'extras cover', 'out-of-pocket', 'out of pocket', 'mbs', 'cobertura', 'what do i get') ||
    hasFuzzy('cover', 'coverage', 'cobertura', 'essentials', 'comprehensive') ||
    containsCommandVariant(c, 'cover') ||
    hasRaw('保障范围', '包括', '承保')
  ) {
    return { intent: 'coverage', confidence: 0.87, needsClarification: false, keywords: ['coverage'], source: 'deterministic', rule: 'coverage' };
  }
  // Providers only with a location-seeking signal; otherwise fall through.
  // tSpace folds hyphens so "direct-billing" matches "direct billing".
  const tSpace = t.replace(/[-_]/g, ' ');
  const hasSpace = (...words: string[]) => words.some((w) => tSpace.includes(w));
  if (
    hasSpace('direct billing', 'find a doctor', 'find doctor', 'find gp', 'find a gp', 'nearby clinic', 'members choice', "members' choice", 'provider', 'facturación directa', 'facturacion directa', 'proveedor', 'clínica', 'clinica') ||
    hasFuzzy('provider', 'providers', 'proveedor', 'doctor', 'clinic', 'clinica', 'hospital', 'gp') ||
    hasRaw('直付', '诊所', '医生', '医疗机构', '医院')
  ) {
    if (LOCATION_SIGNAL.test(t) || has('direct billing', 'provider', 'proveedor', 'members choice', "members' choice") || hasRaw('直付', '医疗机构')) {
      return { intent: 'providers', confidence: 0.88, needsClarification: false, keywords: ['provider'], source: 'deterministic', rule: 'providers-location' };
    }
    // Bare facility word with an action verb elsewhere (claim/cover/cost):
    // let the money/coverage rules above or the LLM decide.
    if (has('claim', 'cover', 'cost', 'price', 'bill', 'sick', 'fever', 'do i do', 'should i')) return null;
    return { intent: 'providers', confidence: 0.78, needsClarification: false, keywords: ['provider'], source: 'deterministic', rule: 'providers-bare' };
  }
  if (has('update', 'news', 'announcement', 'change to cover', 'new benefit', 'actualiz', 'noticia') || hasFuzzy('update', 'updates', 'news') || hasRaw('更新', '通知', '最新消息')) {
    return { intent: 'updates', confidence: 0.8, needsClarification: false, keywords: ['updates'], source: 'deterministic', rule: 'updates' };
  }
  // Support needs an explicit human-contact signal, not a bare "contact/help"
  // inside a longer domain question (claims already handled above).
  if (
    has('speak to someone', 'call medibank', 'phone number', 'store near', 'talk to a human', 'real person', 'hablar con', 'persona real') ||
    hasFuzzy('support', 'contact', 'human', 'ayuda', 'contacto', 'soporte') ||
    hasRaw('客服', '人工', '联系', '帮助')
  ) {
    if (t.trim().split(/\s+/).length <= 3 || !has('claim', 'cover', 'visa', 'waiting', 'reward', 'pharmacy', 'doctor', 'hospital', 'reimburse')) {
      return { intent: 'support', confidence: 0.85, needsClarification: false, keywords: ['support'], source: 'deterministic', rule: 'support' };
    }
    return null;
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
          const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0.6;
          const keywords = Array.isArray(parsed.keywords)
            ? parsed.keywords
              .map((k) => String(k).toLowerCase().replace(/[^a-z0-9áéíóúüñ _-]/g, '').trim())
              .filter((k) => k.length >= 2 && k.length <= 32)
              .slice(0, 6)
            : [];
          return {
            intent,
            subIntent: typeof parsed.sub_intent === 'string' ? parsed.sub_intent.slice(0, 64) : undefined,
            confidence,
            needsClarification: parsed.needs_clarification === true || confidence < 0.45,
            keywords,
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

const REWARDS_COPY: Record<SupportedLanguage, { lead: string; tail: string }> = {
  en: {
    lead: '*Student rewards change often — I only use the official page.*',
    tail: `*Next step:* open the page, then reply COVER to check what OSHC includes (rewards don't replace OSHC).`,
  },
  'zh-CN': {
    lead: '*学生奖励经常变化，请以官方页面为准。*',
    tail: '*下一步：*查看官方页面，再回复“保障”确认 OSHC 包括什么（奖励不能替代 OSHC）。',
  },
  es: {
    lead: '*Las recompensas cambian — solo uso la página oficial.*',
    tail: '*Siguiente paso:* abre la página y responde COBERTURA (las recompensas no reemplazan OSHC).',
  },
};

const UPDATES_COPY: Record<SupportedLanguage, string> = {
  en: `*I don't invent offers or policy changes.* Check these official sources:`,
  'zh-CN': '*我不会编造优惠或政策变化。*请查看以下官方渠道：',
  es: '*No invento ofertas ni cambios.* Consulta estas fuentes oficiales:',
};

const NEXT_STEP_BY_INTENT: Record<string, Record<SupportedLanguage, string>> = {
  coverage: {
    en: '*Next step:* reply CLAIM if you need to claim, or VISA for waiting periods.',
    'zh-CN': '*下一步：*需要理赔请回复“理赔”，查等待期请回复“签证”。',
    es: '*Siguiente paso:* responde RECLAMO para reclamar o VISA por esperas.',
  },
  claims: {
    en: '*Next step:* reply REIMBURSEMENT to learn when you get paid.',
    'zh-CN': '*下一步：*回复“报销”了解多久能拿回费用。',
    es: '*Siguiente paso:* responde REEMBOLSO para saber cuándo recibes el pago.',
  },
  reimbursements: {
    en: '*Next step:* reply CLAIM for how to submit, or HELP for a person.',
    'zh-CN': '*下一步：*回复“理赔”看提交方式，或回复“帮助”找人工。',
    es: '*Siguiente paso:* responde RECLAMO o AYUDA.',
  },
  providers: {
    en: '*Next step:* reply PHARMACY for medicines, or HELP for a person.',
    'zh-CN': '*下一步：*问药品请回复“药房”，找人工请回复“帮助”。',
    es: '*Siguiente paso:* responde FARMACIA o AYUDA.',
  },
  pharmacy: {
    en: '*Next step:* reply CLAIM if you need to claim medicines.',
    'zh-CN': '*下一步：*需要报销药品请回复“理赔”。',
    es: '*Siguiente paso:* responde RECLAMO si necesitas reclamar medicamentos.',
  },
  visa_compliance: {
    en: '*Next step:* reply COVER to check what is included.',
    'zh-CN': '*下一步：*回复“保障”查看包括什么。',
    es: '*Siguiente paso:* responde COBERTURA.',
  },
  waiting_periods: {
    en: '*Next step:* reply COVER to check what is included.',
    'zh-CN': '*下一步：*回复“保障”查看包括什么。',
    es: '*Siguiente paso:* responde COBERTURA.',
  },
};

function withNextStep(text: string, intent: Intent, language: SupportedLanguage): string {
  if (/\*Next step:\*|\*下一步| \*Siguiente paso:\*/.test(text)) return text;
  const hint = NEXT_STEP_BY_INTENT[intent]?.[language] || t(language, 'nextStepFallback');
  return `${text.trim()}\n\n${hint}`;
}

function fmt(text: string): string {
  return formatWhatsAppAnswer(text);
}

export function staticAnswerFor(intent: Intent, question: string, language: SupportedLanguage = 'en'): AssistantAnswer | null {
  switch (intent) {
    case 'greeting':
      return { text: fmt(t(language, 'greeting')), intent, language, sourceIds: [], sourceUrls: [], usedLlm: false };
    case 'student_rewards':
      return {
        text: fmt(
          `${REWARDS_COPY[language].lead}\n\n` +
          `• ${REWARDS_DESTINATION.title}: ${REWARDS_DESTINATION.url}\n\n` +
          REWARDS_COPY[language].tail,
        ),
        intent,
        language,
        sourceIds: ['livebetter-rewards'],
        sourceUrls: [REWARDS_DESTINATION.url],
        usedLlm: false,
      };
    case 'updates':
      return {
        text: fmt(
          `${UPDATES_COPY[language]}\n\n` +
          UPDATES_DESTINATIONS.map((d) => `• ${d.title}: ${d.url}`).join('\n') +
          `\n\n${t(language, 'askVerifyUpdate')}`,
        ),
        intent,
        language,
        sourceIds: ['official-updates'],
        sourceUrls: UPDATES_DESTINATIONS.map((d) => d.url),
        usedLlm: false,
      };
    case 'support':
      return {
        text: fmt(t(language, 'support')),
        intent,
        language,
        sourceIds: ['support'],
        sourceUrls: [
          'https://www.medibankoshc.com.au/contact-us/',
          'https://www.medibankoshc.com.au/find-provider/',
          'https://www.members.medibankoshc.com.au/login/submit-claim.html',
        ],
        usedLlm: false,
      };
    case 'forms_and_guides':
      if (/claim|reclam|理赔|索赔/i.test(question)) {
        return {
          text: fmt(t(language, 'claimForms')),
          intent,
          language,
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

export function clarificationAnswer(language: SupportedLanguage = 'en'): AssistantAnswer {
  return {
    text: fmt(t(language, 'clarification')),
    intent: 'unknown',
    language,
    sourceIds: [],
    sourceUrls: [],
    usedLlm: false,
  };
}

export async function answerWithSources(
  question: string,
  classification: IntentClassification,
  opts: { chunks?: KbChunk[]; history?: ConversationTurn[]; fetchImpl?: typeof fetch; language?: SupportedLanguage } = {},
): Promise<AssistantAnswer> {
  const language: SupportedLanguage = opts.language || 'en';
  const staticAns = staticAnswerFor(classification.intent, question, language);
  // Prefer deterministic links for rewards/updates/support/greeting; still allow
  // LLM to expand ONLY if retrieval is available — but never invent offers.
  if (staticAns && ['greeting', 'student_rewards', 'updates', 'support'].includes(classification.intent)) {
    return staticAns;
  }

  const expandedQuestion = expandQueryWithAliases(question);
  const chunks = opts.chunks || (await cachedKbChunks().catch(() => [] as KbChunk[]));
  const results = retrieve(chunks, `${expandedQuestion} ${(classification.keywords || []).join(' ')}`, classification.intent, 3);
  const { ids, urls } = formatSources(results);

  const cfg = mistralConfig();
  if (cfg.keys.length && results.length) {
    const res = await mistralChat(answerMessages(question, classification.intent, results, opts.history || [], language), {
      maxTokens: cfg.maxTokensAnswer,
      temperature: 0.2,
      fetchImpl: opts.fetchImpl,
    });
    if (res.ok) {
      const formatted = formatWhatsAppAnswer(`${res.text}\n\n${t(language, 'disclaimer')}`);
      return { text: withNextStep(formatted, classification.intent, language), intent: classification.intent, language, sourceIds: ids, sourceUrls: urls, usedLlm: true, model: res.model };
    }
  }

  if (staticAns) return staticAns;

  // Low-confidence / unknown → one short clarification with choices.
  if (classification.intent === 'unknown' || classification.needsClarification || classification.confidence < 0.45) {
    if (!results.length) return clarificationAnswer(language);
  }

  // Non-English fallback must NOT dump raw English KB excerpts.
  if (language !== 'en') {
    return {
      text: fmt(
        `${t(language, 'fallbackLlmUnavailable')}\n\n${urls.slice(0, 2).join('\n') || 'https://www.medibankoshc.com.au/'}` +
        (results.length ? '' : `\n\n${t(language, 'fallbackNoSources')}`),
      ),
      intent: classification.intent,
      language,
      sourceIds: ids,
      sourceUrls: urls,
      usedLlm: false,
    };
  }

  // Deterministic fallback: short extractive summary (English only), max 2 chunks.
  if (results.length) {
    const top = results.slice(0, 1);
    const body = top
      .map((r) => r.chunk.content.slice(0, 420).trim())
      .join('\n\n');
    return {
      text: fmt(
        `*Here's what OSHC sources say:*\n\n${body}\n\n` +
        `${t(language, 'sourcesLabel')} ${urls.slice(0, 2).join(', ')}\n\n${t(language, 'disclaimer')}\n\n` +
        `*Next step:* reply SUPPORT or call *134 148*.`,
      ),
      intent: classification.intent,
      language,
      sourceIds: ids,
      sourceUrls: urls,
      usedLlm: false,
    };
  }

  return {
    text: fmt(t(language, 'fallbackUnknown')),
    intent: classification.intent,
    language,
    sourceIds: [],
    sourceUrls: [],
    usedLlm: false,
  };
}
