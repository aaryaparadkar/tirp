import { mistralConfig } from './config.js';
import { t } from './i18n.js';
import { cachedKbChunks } from './kb/loader.js';
import { formatSources, retrieve } from './kb/index.js';
import { REWARDS_DESTINATION, UPDATES_DESTINATIONS } from './kb/sources.js';
import { answerMessages, classifierMessages, VALID_INTENTS } from './llm/prompts.js';
import { mistralChat } from './llm/mistral.js';
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
  const t = (text || '').trim().toLowerCase();
  if (BUTTON_TO_INTENT[t]) return BUTTON_TO_INTENT[t];
  const num = t.replace(/^[^\d]*(\d)[^\d]*$/, '$1');
  const found = MENU_OPTIONS.find((o) => o.key === t || o.key === num);
  if (found) return found.intent;
  // Friendly phrases (EN + ES + ZH keywords).
  if (/^(cover|coverage|my cover|understand.*cover)/.test(t)) return 'coverage';
  if (/cobertura/.test(t)) return 'coverage';
  if (/保障|保障范围|包括什么/.test(text)) return 'coverage';
  if (/^(claim|claims|reimburse|refund)/.test(t)) return 'claims';
  if (/reclam|reembolso/.test(t)) return 'claims';
  if (/理赔|报销|索赔/.test(text)) return 'claims';
  if (/reward|perk|benefit/.test(t)) return 'student_rewards';
  if (/recompensa|beneficio/.test(t)) return 'student_rewards';
  if (/奖励|福利|优惠/.test(text)) return 'student_rewards';
  if (/update|news|announcement/.test(t)) return 'updates';
  if (/actualiz/.test(t)) return 'updates';
  if (/更新|通知|最新/.test(text)) return 'updates';
  if (/form|guide|brochure|pdf/.test(t)) return 'forms_and_guides';
  if (/formulario|gu[ií]a/.test(t)) return 'forms_and_guides';
  if (/表格|指南|手册|下载/.test(text)) return 'forms_and_guides';
  if (/visa|visado/.test(t)) return 'visa_compliance';
  if (/签证/.test(text)) return 'visa_compliance';
  if (/waiting|espera/.test(t)) return 'waiting_periods';
  if (/等待期|等待时间/.test(text)) return 'waiting_periods';
  if (/pharmacy|medicine|prescription/.test(t)) return 'pharmacy';
  if (/farmacia|medicamento/.test(t)) return 'pharmacy';
  if (/药房|处方|药品|药物/.test(text)) return 'pharmacy';
  if (/doctor|gp|hospital|clinic|provider|direct billing/.test(t)) return 'providers';
  if (/m[eé]dico|cl[ií]nica|proveedor|facturaci[oó]n directa/.test(t)) return 'providers';
  if (/医生|诊所|医院|直付|医疗机构/.test(text)) return 'providers';
  if (/support|contact|human|person|help/.test(t)) return 'support';
  if (/ayuda|contacto|soporte|persona/.test(t)) return 'support';
  if (/客服|人工|联系|帮助/.test(text)) return 'support';
  return null;
}

export function deterministicClassify(text: string): IntentClassification | null {
  const raw = text || '';
  const t = raw.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  const hasRaw = (...words: string[]) => words.some((w) => raw.includes(w));
  if (!t.trim()) return null;
  if (
    has('000', 'ambulance', 'unconscious', "can't breathe", 'cannot breathe', 'bleeding heavily', 'chest pain', 'had an accident', 'seriously injured', 'overdose') ||
    has('emergencia', 'ambulancia', 'inconsciente', 'no puedo respirar', 'sangrado grave', 'dolor en el pecho', 'accidente grave', 'tuve un accidente') ||
    hasRaw('救命', '紧急', '救护车', '呼吸困难', '不能呼吸', '失去意识', '昏倒', '严重出血', '胸痛', '出事故', '车祸', '有人受伤')
  ) {
    return { intent: 'emergency', confidence: 0.95, needsClarification: false, keywords: ['emergency'], source: 'deterministic' };
  }
  if (has('reward', 'livebetter', 'live better', 'perk', 'student plus', 'recompensa', 'beneficio') || hasRaw('奖励', '福利', '优惠', '学生奖励')) {
    return { intent: 'student_rewards', confidence: 0.9, needsClarification: false, keywords: ['rewards'], source: 'deterministic' };
  }
  if (has('waiting period', 'waiting time', 'pre-existing', 'pre existing', 'how long until covered', 'período de espera', 'periodo de espera') || hasRaw('等待期', '等待时间')) {
    return { intent: 'waiting_periods', confidence: 0.9, needsClarification: false, keywords: ['waiting'], source: 'deterministic' };
  }
  if (has('visa', 'visado', 'subclass 500', 'condition 8501', 'student visa requirement') || hasRaw('签证', '500签证')) {
    return { intent: 'visa_compliance', confidence: 0.9, needsClarification: false, keywords: ['visa'], source: 'deterministic' };
  }
  if (has('direct billing', 'find a doctor', 'find doctor', 'find gp', 'find a gp', 'nearby clinic', 'members choice', "members' choice", 'provider', 'facturación directa', 'facturacion directa', 'proveedor', 'clínica', 'clinica') || hasRaw('直付', '诊所', '医生', '医疗机构')) {
    return { intent: 'providers', confidence: 0.88, needsClarification: false, keywords: ['provider'], source: 'deterministic' };
  }
  if (has('pharmacy', 'prescription', 'medicine', 'medicines', 'pbs', 'over-the-counter', 'drug cost', 'farmacia', 'medicamento', 'receta') || hasRaw('药房', '处方', '药品', '药物')) {
    return { intent: 'pharmacy', confidence: 0.88, needsClarification: false, keywords: ['pharmacy'], source: 'deterministic' };
  }
  if (has('reimburse', 'reimbursement', 'refund', 'paid back', 'get my money back', 'bank account payment', 'reembolso') || hasRaw('报销', '退款', '拿回费用')) {
    return { intent: 'reimbursements', confidence: 0.88, needsClarification: false, keywords: ['reimbursement'], source: 'deterministic' };
  }
  if (has('claim', 'receipt', 'invoice', 'claim form', 'online member services', 'how to claim', 'reclamo', 'reclamación', 'recibo') || hasRaw('理赔', '索赔', '收据', '发票')) {
    return { intent: 'claims', confidence: 0.9, needsClarification: false, keywords: ['claim'], source: 'deterministic' };
  }
  if (has('form', 'brochure', 'member guide', 'cover summary', 'pdf', 'download', 'formulario', 'folleto', 'guía', 'guia') || hasRaw('表格', '指南', '手册', '下载', '保障摘要')) {
    return { intent: 'forms_and_guides', confidence: 0.85, needsClarification: false, keywords: ['forms'], source: 'deterministic' };
  }
  if (has('essentials', 'comprehensive', 'what is covered', "what's covered", 'is dental covered', 'is optical covered', 'hospital cover', 'extras cover', 'out-of-pocket', 'out of pocket', 'mbs', 'cobertura') || hasRaw('保障范围', '包括', '承保')) {
    return { intent: 'coverage', confidence: 0.87, needsClarification: false, keywords: ['coverage'], source: 'deterministic' };
  }
  if (has('gp', 'sick', 'cold', 'fever', 'hospital', 'seeing a doctor', 'healthcare', 'health system', 'medicare', 'enfermo', 'fiebre', 'salud') || hasRaw('生病', '感冒', '发烧', '医疗')) {
    return { intent: 'healthcare_navigation', confidence: 0.8, needsClarification: false, keywords: ['healthcare'], source: 'deterministic' };
  }
  if (has('update', 'news', 'announcement', 'change to cover', 'new benefit', 'actualiz', 'noticia') || hasRaw('更新', '通知', '最新消息')) {
    return { intent: 'updates', confidence: 0.8, needsClarification: false, keywords: ['updates'], source: 'deterministic' };
  }
  if (has('contact', 'support', 'human', 'speak to someone', 'call medibank', 'phone number', 'store near', 'ayuda', 'contacto', 'persona') || hasRaw('客服', '人工', '联系', '帮助')) {
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

const REWARDS_COPY: Record<SupportedLanguage, { lead: string; tail: string }> = {
  en: {
    lead: 'Student rewards can change, so I only use the official page.',
    tail: `Tell me if you want help understanding whether rewards affect your OSHC hospital/medical cover (they don't replace OSHC cover).`,
  },
  'zh-CN': {
    lead: '学生奖励会经常变化，请以官方页面为准。',
    tail: '如果你想了解学生奖励是否影响你的 OSHC 住院/医疗保障（它不能替代 OSHC），可以继续问我。',
  },
  es: {
    lead: 'Las recompensas para estudiantes cambian, así que solo uso la página oficial.',
    tail: 'Dime si quieres ayuda para entender si las recompensas afectan tu cobertura hospitalaria/médica de OSHC (no la reemplazan).',
  },
};

const UPDATES_COPY: Record<SupportedLanguage, string> = {
  en: `I don't invent current offers or policy changes. Check these official sources:`,
  'zh-CN': '我不会编造当前的优惠或政策变化。请查看以下官方渠道：',
  es: 'No invento ofertas ni cambios de póliza actuales. Consulta estas fuentes oficiales:',
};

export function staticAnswerFor(intent: Intent, question: string, language: SupportedLanguage = 'en'): AssistantAnswer | null {
  switch (intent) {
    case 'greeting':
      return { text: t(language, 'greeting'), intent, language, sourceIds: [], sourceUrls: [], usedLlm: false };
    case 'student_rewards':
      return {
        text:
          `${REWARDS_COPY[language].lead}\n\n` +
          `${REWARDS_DESTINATION.title}: ${REWARDS_DESTINATION.url}\n` +
          `${REWARDS_DESTINATION.note}\n\n` +
          REWARDS_COPY[language].tail,
        intent,
        language,
        sourceIds: ['livebetter-rewards'],
        sourceUrls: [REWARDS_DESTINATION.url],
        usedLlm: false,
      };
    case 'updates':
      return {
        text:
          `${UPDATES_COPY[language]}\n\n` +
          UPDATES_DESTINATIONS.map((d) => `${d.title}: ${d.url}`).join('\n') +
          `\n\n${t(language, 'askVerifyUpdate')}`,
        intent,
        language,
        sourceIds: ['official-updates'],
        sourceUrls: UPDATES_DESTINATIONS.map((d) => d.url),
        usedLlm: false,
      };
    case 'support':
      return {
        text: `${t(language, 'support')}\n\n${t(language, 'disclaimer')}`,
        intent,
        language,
        sourceIds: ['support'],
        sourceUrls: [
          'https://www.medibankoshc.com.au/contact-us/',
          'https://www.medibankoshc.com.au/find-provider/',
          'https://www.medibank.com.au/health-insurance/find-provider/',
          'https://www.members.medibankoshc.com.au/login.html',
          'https://www.members.medibankoshc.com.au/login/submit-claim.html',
        ],
        usedLlm: false,
      };
    case 'forms_and_guides':
      if (/claim|reclam|理赔|索赔/i.test(question)) {
        return {
          text: t(language, 'claimForms'),
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

  const chunks = opts.chunks || (await cachedKbChunks().catch(() => [] as KbChunk[]));
  const results = retrieve(chunks, `${question} ${(classification.keywords || []).join(' ')}`, classification.intent, 4);
  const { ids, urls } = formatSources(results);

  const cfg = mistralConfig();
  if (cfg.keys.length && results.length) {
    const res = await mistralChat(answerMessages(question, classification.intent, results, opts.history || [], language), {
      maxTokens: cfg.maxTokensAnswer,
      temperature: 0.2,
      fetchImpl: opts.fetchImpl,
    });
    if (res.ok) {
      const text = res.text.length > 1800 ? `${res.text.slice(0, 1750)}…` : res.text;
      return { text: `${text}\n\n${t(language, 'disclaimer')}`, intent: classification.intent, language, sourceIds: ids, sourceUrls: urls, usedLlm: true, model: res.model };
    }
  }

  if (staticAns) return staticAns;

  // Non-English fallback must NOT dump raw English KB excerpts.
  if (language !== 'en') {
    return {
      text:
        `${t(language, 'fallbackLlmUnavailable')}\n\n${urls.slice(0, 3).join('\n') || 'https://www.medibankoshc.com.au/'}` +
        (results.length ? '' : `\n\n${t(language, 'fallbackNoSources')}`),
      intent: classification.intent,
      language,
      sourceIds: ids,
      sourceUrls: urls,
      usedLlm: false,
    };
  }

  // Deterministic fallback: extractive summary from retrieved chunks (English only).
  if (results.length) {
    const top = results.slice(0, 2);
    const body = top
      .map((r) => r.chunk.content.slice(0, 600).trim())
      .join('\n\n---\n\n');
    return {
      text:
        `Here's what Medibank OSHC sources say (general info only):\n\n${body}\n\n` +
        `${t(language, 'sourcesLabel')}\n${urls.join('\n')}\n\n${t(language, 'disclaimer')}\n` +
        `If this doesn't answer it, reply SUPPORT or call 134 148.`,
      intent: classification.intent,
      language,
      sourceIds: ids,
      sourceUrls: urls,
      usedLlm: false,
    };
  }

  return {
    text: t(language, 'fallbackUnknown'),
    intent: classification.intent,
    language,
    sourceIds: [],
    sourceUrls: [],
    usedLlm: false,
  };
}
