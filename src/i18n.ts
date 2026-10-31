import { OSHC_GENERAL_LINE, STUDENT_SUPPORT_LINE } from './config.js';
import type { Intent, SupportedLanguage } from './types.js';

export type TranslationKey =
  | 'greeting'
  | 'fullMenu'
  | 'disclaimer'
  | 'support'
  | 'emptyMessage'
  | 'fallbackUnknown'
  | 'fallbackNoSources'
  | 'fallbackLlmUnavailable'
  | 'menuFooter'
  | 'chooseTopic'
  | 'replyMenuHint'
  | 'sourcesLabel'
  | 'claimForms'
  | 'askVerifyUpdate'
  | 'clarification'
  | 'illegible'
  | 'nextStepFallback';

const STRINGS: Record<SupportedLanguage, Record<TranslationKey, string>> = {
  en: {
    greeting:
      `*Hi, I'm your Medibank OSHC assistant.*\n\n` +
      `What would you like to do?\n\n` +
      `1. Understand my cover\n` +
      `2. Make a claim\n` +
      `3. Find a doctor or clinic\n` +
      `4. Pharmacy and medicines\n` +
      `5. Visa or waiting periods\n\n` +
      `Reply with a *number (1-5)* or type your question.\n` +
      `Reply *HELP* for the 24/7 support line, *MENU* to see this menu again.\n` +
      `Emergency? Call *000* now.`,
    fullMenu:
      `*All topics:*\n\n` +
      `1. Understand my cover (Essentials vs Comprehensive)\n` +
      `2. Make a claim and get paid back\n` +
      `3. Find a doctor or clinic near you\n` +
      `4. Pharmacy and medicines\n` +
      `5. Visa rules and waiting periods\n` +
      `6. Student rewards\n` +
      `7. Important Medibank updates\n` +
      `8. Forms and member guides\n` +
      `9. Urgent help — call 000\n\n` +
      `Reply with a *number (1-9)*, tap an option, or type your question.\n` +
      `I give general information from Medibank OSHC sources only.`,
    disclaimer:
      'General information only, from Medibank OSHC sources. Not medical advice. For personal cover or claim decisions, contact Medibank OSHC.',
    support:
      `*Need a person?*\n\n` +
      `Here's how to reach a person:\n\n` +
      `• Contact: https://www.medibankoshc.com.au/contact-us/\n` +
      `• Direct-billing providers: https://www.medibankoshc.com.au/find-provider/\n` +
      `• Claim online: https://www.members.medibankoshc.com.au/login/submit-claim.html\n\n` +
      `*Phone: Medibank OSHC 134 148 | 24/7 Student Health and Support Line 1800 887 283*\n\n` +
      `*Next step:* reply COVER, CLAIM, or MENU.`,
    emptyMessage: 'I got an empty message. Reply *MENU* to see what I can help with.',
    fallbackUnknown:
      `*I couldn't find that in the Medibank OSHC sources I have.*\n\n` +
      `Try one:\n` +
      `• *Cover* — what is included?\n` +
      `• *Claim* — how do I claim?\n` +
      `• *Visa* — waiting periods?\n\n` +
      `*Next step:* reply MENU to see the menu.\n\n` +
      `For personal help: https://www.medibankoshc.com.au/contact-us/ or 134 148.`,
    fallbackNoSources:
      `*I couldn't find that in the Medibank OSHC sources I have.*\n\n` +
      `Try asking about cover, claims, providers, pharmacy, visa, or reply MENU.\n\n` +
      `For personal help: https://www.medibankoshc.com.au/contact-us/ or 134 148.`,
    fallbackLlmUnavailable:
      `我暂时无法用中文生成可靠的完整答案。请查看以下 Medibank OSHC 官方信息，或联系 Medibank OSHC 获取帮助：`,
    menuFooter: 'Medibank OSHC • general info only',
    chooseTopic: 'Choose topic',
    replyMenuHint: 'Reply MENU anytime',
    sourcesLabel: 'Sources:',
    claimForms:
      `*Claim online first — it's fastest:*\n\n` +
      `• Member Services: https://www.members.medibankoshc.com.au/login.html\n` +
      `• Claim form: https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
      `• In store with your receipts\n\n` +
      `More forms: https://www.medibank.com.au/health-insurance/using-your-cover/brochures-forms/\n\n` +
      `*Next step:* reply REIMBURSEMENT to learn when you get paid.`,
    askVerifyUpdate: `Tell me what update you heard about (e.g. price, cover change, app change) and I'll explain how to verify it for your policy.`,
    clarification:
      `*I'm not sure what you're asking.*\n\n` +
      `Pick a topic:\n\n` +
      `1. Understand my cover\n` +
      `2. Make a claim\n` +
      `3. Find a doctor or clinic\n` +
      `4. Pharmacy and medicines\n` +
      `5. Visa or waiting periods\n\n` +
      `Reply with a *number (1-5)*, or ask again in a few words — e.g. "how do I claim a GP visit?"`,
    illegible:
      `*Sorry, I couldn't read that message.* 🤔\n\n` +
      `It doesn't look like words I understand, so I won't guess.\n\n` +
      `Please type your question in a few words (e.g. "what does my cover include?"), or reply *MENU* to see topics.\n\n` +
      `Emergency? Call *000* now.`,
    nextStepFallback: `*Next step:* reply MENU to see the menu, or type your question in a few words.`,
  },
  'zh-CN': {
    greeting:
      `*你好，我是你的 Medibank OSHC 助手。*\n\n` +
      `你想做什么？\n\n` +
      `1. 了解保障范围\n` +
      `2. 申请理赔\n` +
      `3. 查找医生或诊所\n` +
      `4. 药房和处方药\n` +
      `5. 签证或等待期\n\n` +
      `请回复*数字（1-5）*，或直接输入问题。\n` +
      `回复*帮助*获取 24/7 支持热线，回复*菜单*再次查看此菜单。\n` +
      `紧急情况请立即拨打 *000*。`,
    fullMenu:
      `*全部主题：*\n\n` +
      `1. 了解保障范围（Essentials 与 Comprehensive）\n` +
      `2. 申请理赔和报销\n` +
      `3. 查找附近的医生或诊所\n` +
      `4. 药房和处方药\n` +
      `5. 签证要求和等待期\n` +
      `6. 学生奖励和福利\n` +
      `7. Medibank 重要更新\n` +
      `8. 表格和会员指南\n` +
      `9. 紧急求助：拨打 000\n\n` +
      `请回复*数字（1-9）*、点击选项，或直接输入问题。`,
    disclaimer: '仅为来自 Medibank OSHC 资料的一般信息，不是医疗建议。如需确认个人保障或理赔结果，请联系 Medibank OSHC。',
    support:
      `*需要人工帮助？*\n\n` +
      `你可以通过以下方式联系人工客服：\n\n` +
      `• 联系：https://www.medibankoshc.com.au/contact-us/\n` +
      `• 直付医疗机构：https://www.medibankoshc.com.au/find-provider/\n` +
      `• 在线理赔：https://www.members.medibankoshc.com.au/login/submit-claim.html\n\n` +
      `*电话：Medibank OSHC 134 148｜24/7 学生健康与支持热线 1800 887 283*\n\n` +
      `*下一步：*回复“保障”、“理赔”或“菜单”。`,
    emptyMessage: '我收到了一条空消息。请回复*“菜单”*查看我可以帮你做什么。',
    fallbackUnknown:
      `*我在现有的 Medibank OSHC 资料中没有找到相关内容。*\n\n` +
      `你可以试试：\n` +
      `• *保障*——包括什么？\n` +
      `• *理赔*——如何理赔？\n` +
      `• *签证*——等待期多久？\n\n` +
      `*下一步：*回复“菜单”查看菜单。\n\n` +
      `如需人工帮助：https://www.medibankoshc.com.au/contact-us/ 或致电 134 148。`,
    fallbackNoSources:
      `*我在现有的 Medibank OSHC 资料中没有找到相关内容。*\n\n` +
      `你可以询问保障范围、理赔、医疗机构、药房、签证，或回复“菜单”。\n\n` +
      `如需人工帮助：https://www.medibankoshc.com.au/contact-us/ 或致电 134 148。`,
    fallbackLlmUnavailable:
      `我暂时无法用中文生成可靠的完整答案。请查看以下 Medibank OSHC 官方信息，或联系 Medibank OSHC 获取帮助：`,
    menuFooter: 'Medibank OSHC • 仅为一般信息',
    chooseTopic: '选择主题',
    replyMenuHint: '随时回复“菜单”',
    sourcesLabel: '资料来源：',
    claimForms:
      `*请优先在线理赔，最快：*\n\n` +
      `• 在线会员服务：https://www.members.medibankoshc.com.au/login.html\n` +
      `• 在线理赔表：https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
      `• 携带收据到任意 Medibank 门店\n\n` +
      `*下一步：*回复“报销”了解多久能拿回费用。`,
    askVerifyUpdate: '请告诉我你听到的更新内容（例如价格、保障变化、App 变化），我会告诉你如何针对你的保单进行核实。',
    clarification:
      `*我不太确定你想问什么。*\n\n` +
      `请选择主题：\n\n` +
      `1. 了解保障范围\n` +
      `2. 申请理赔\n` +
      `3. 查找医生或诊所\n` +
      `4. 药房和处方药\n` +
      `5. 签证或等待期\n\n` +
      `请回复*数字（1-5）*，或用几个词重新描述，例如“看GP怎么理赔？”`,
    illegible:
      `*抱歉，我看不懂这条消息。* 🤔\n\n` +
      `它看起来不像我能理解的文字，所以我不会猜测。\n\n` +
      `请用几个词输入你的问题（例如“我的保障包括什么？”），或回复*菜单*查看主题。\n\n` +
      `紧急情况请立即拨打 *000*。`,
    nextStepFallback: `*下一步：*回复“菜单”查看菜单，或用几个词描述你的问题。`,
  },
  es: {
    greeting:
      `*Hola, soy tu asistente de Medibank OSHC.*\n\n` +
      `¿Qué quieres hacer?\n\n` +
      `1. Entender mi cobertura\n` +
      `2. Hacer un reclamo\n` +
      `3. Buscar un médico o clínica\n` +
      `4. Farmacia y medicamentos\n` +
      `5. Visa o períodos de espera\n\n` +
      `Responde con un *número (1-5)* o escribe tu pregunta.\n` +
      `Responde *AYUDA* para la línea de apoyo 24/7, *MENÚ* para ver este menú otra vez.\n` +
      `¿Emergencia? Llama al *000* ahora.`,
    fullMenu:
      `*Todos los temas:*\n\n` +
      `1. Entender tu cobertura OSHC (Essentials y Comprehensive)\n` +
      `2. Reclamaciones y reembolsos\n` +
      `3. Buscar un médico o clínica cerca de ti\n` +
      `4. Farmacias y medicamentos\n` +
      `5. Requisitos de visa y períodos de espera\n` +
      `6. Recompensas y beneficios para estudiantes\n` +
      `7. Actualizaciones importantes de Medibank\n` +
      `8. Formularios y guías para miembros\n` +
      `9. Urgencias: llama al 000\n\n` +
      `Responde con un *número (1-9)*, elige una opción o escribe tu pregunta.`,
    disclaimer: 'Solo información general de fuentes de Medibank OSHC. No es asesoramiento médico. Para decisiones sobre tu cobertura o reclamación, contacta con Medibank OSHC.',
    support:
      `*¿Necesitas una persona?*\n\n` +
      `Así puedes contactar con una persona:\n\n` +
      `• Contacto: https://www.medibankoshc.com.au/contact-us/\n` +
      `• Facturación directa: https://www.medibankoshc.com.au/find-provider/\n` +
      `• Reclamo en línea: https://www.members.medibankoshc.com.au/login/submit-claim.html\n\n` +
      `*Teléfono: Medibank OSHC 134 148 | Línea 24/7: 1800 887 283*\n\n` +
      `*Siguiente paso:* responde COBERTURA, RECLAMO o MENÚ.`,
    emptyMessage: 'Recibí un mensaje vacío. Responde *MENÚ* para ver en qué puedo ayudarte.',
    fallbackUnknown:
      `*No encontré eso en las fuentes de Medibank OSHC que tengo.*\n\n` +
      `Prueba con:\n` +
      `• *Cobertura* — ¿qué incluye?\n` +
      `• *Reclamo* — ¿cómo reclamo?\n` +
      `• *Visa* — ¿períodos de espera?\n\n` +
      `*Siguiente paso:* responde MENÚ.\n\n` +
      `Para ayuda personal: https://www.medibankoshc.com.au/contact-us/ o llama al 134 148.`,
    fallbackNoSources:
      `*No encontré eso en las fuentes de Medibank OSHC que tengo.*\n\n` +
      `Puedes preguntar sobre cobertura, reclamaciones, proveedores, farmacia, visa o responder MENÚ.\n\n` +
      `Para ayuda personal: https://www.medibankoshc.com.au/contact-us/ o llama al 134 148.`,
    fallbackLlmUnavailable:
      `Por el momento no puedo generar una respuesta completa y fiable en español. Consulta la información oficial de Medibank OSHC o contacta con Medibank OSHC:`,
    menuFooter: 'Medibank OSHC • solo información general',
    chooseTopic: 'Elige un tema',
    replyMenuHint: 'Responde MENÚ cuando quieras',
    sourcesLabel: 'Fuentes:',
    claimForms:
      `*Usa primero la vía en línea, es lo más rápido:*\n\n` +
      `• Online Member Services: https://www.members.medibankoshc.com.au/login.html\n` +
      `• Formulario en línea: https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
      `• En tienda con tus recibos\n\n` +
      `*Siguiente paso:* responde REEMBOLSO para saber cuándo recibes el pago.`,
    askVerifyUpdate: 'Dime qué actualización escuchaste (por ejemplo, precio, cambio de cobertura, cambio en la app) y te explicaré cómo verificarla para tu póliza.',
    clarification:
      `*No estoy seguro de qué preguntas.*\n\n` +
      `Elige un tema:\n\n` +
      `1. Entender mi cobertura\n` +
      `2. Hacer un reclamo\n` +
      `3. Buscar un médico o clínica\n` +
      `4. Farmacia y medicamentos\n` +
      `5. Visa o períodos de espera\n\n` +
      `Responde con un *número (1-5)* o pregunta de nuevo en pocas palabras, por ejemplo: "¿cómo reclamo una visita al GP?"`,
    illegible:
      `*Lo siento, no pude entender ese mensaje.* 🤔\n\n` +
      `No parecen palabras que yo entienda, así que no voy a adivinar.\n\n` +
      `Escribe tu pregunta en pocas palabras (por ejemplo: "¿qué incluye mi cobertura?") o responde *MENÚ* para ver los temas.\n\n` +
      `¿Emergencia? Llama al *000* ahora.`,
    nextStepFallback: `*Siguiente paso:* responde MENÚ para ver el menú, o escribe tu pregunta en pocas palabras.`,
  },
};

export function t(lang: SupportedLanguage, key: TranslationKey): string {
  return STRINGS[lang][key];
}

export interface LocalizedMenuOption {
  key: string;
  intent: Intent;
  label: string;
  description: string;
}

/**
 * Menu rows. WhatsApp hard limits: list-row title 24 chars, button title 20,
 * row description 72. Labels are written to fit 20 so the same text works for
 * the list AND the 3-button fallback — nothing gets cut mid-word.
 * (tests/menu-labels.test.ts enforces this.)
 */
const MENU_LABELS: Record<SupportedLanguage, Array<{ label: string; description: string }>> = {
  en: [
    { label: 'Understand my cover', description: 'Essentials vs Comprehensive — what is included' },
    { label: 'Make a claim', description: 'Claim online and get your money back' },
    { label: 'Find a doctor/clinic', description: 'GPs, direct-billing clinics and hospitals near you' },
    { label: 'Pharmacy & medicines', description: 'Prescriptions, costs and limits' },
    { label: 'Visa & waiting times', description: 'Student visa (500) rules and waiting periods' },
    { label: 'Student rewards', description: 'Medibank rewards and perks for students' },
    { label: 'Important updates', description: 'Latest official Medibank news' },
    { label: 'Forms & guides', description: 'Claim forms, member guide, cover summaries' },
    { label: 'Urgent help (000)', description: 'Emergency or accident — call 000 now' },
  ],
  'zh-CN': [
    { label: '了解保障范围', description: 'Essentials 与 Comprehensive：包括什么' },
    { label: '申请理赔', description: '在线理赔，拿回费用' },
    { label: '查找医生或诊所', description: '附近的 GP、直付诊所和医院' },
    { label: '药房和处方药', description: '处方药费用和限额' },
    { label: '签证和等待期', description: '学生签证（500）要求和等待期' },
    { label: '学生奖励', description: 'Medibank 学生奖励和福利' },
    { label: '重要更新', description: 'Medibank 官方最新消息' },
    { label: '表格和指南', description: '理赔表、会员指南、保障摘要' },
    { label: '紧急求助（000）', description: '紧急情况或事故：立即拨打 000' },
  ],
  es: [
    { label: 'Entender cobertura', description: 'Essentials y Comprehensive: qué incluye' },
    { label: 'Hacer un reclamo', description: 'Reclama en línea y recupera tu dinero' },
    { label: 'Buscar médico', description: 'GP, clínicas con facturación directa y hospitales' },
    { label: 'Farmacia y recetas', description: 'Medicamentos con receta, costos y límites' },
    { label: 'Visa y esperas', description: 'Visa de estudiante (500) y períodos de espera' },
    { label: 'Recompensas', description: 'Recompensas y beneficios para estudiantes' },
    { label: 'Actualizaciones', description: 'Últimas noticias oficiales de Medibank' },
    { label: 'Formularios y guías', description: 'Formularios, guía del miembro, resúmenes' },
    { label: 'Urgencia (000)', description: 'Emergencia o accidente: llama al 000 ahora' },
  ],
};

const MENU_INTENTS: Intent[] = [
  'coverage',
  'claims',
  'providers',
  'pharmacy',
  'visa_compliance',
  'student_rewards',
  'updates',
  'forms_and_guides',
  'emergency',
];

export function getMenuOptions(lang: SupportedLanguage): LocalizedMenuOption[] {
  const labels = MENU_LABELS[lang];
  return labels.map((l, i) => ({ key: String(i + 1), intent: MENU_INTENTS[i], label: l.label, description: l.description }));
}

/** First-run quick menu: 5 goals, same numbers as the full menu (1-5). */
export function getQuickMenuOptions(lang: SupportedLanguage): LocalizedMenuOption[] {
  return getMenuOptions(lang).slice(0, 5);
}

export function supportLineFor(_lang: SupportedLanguage): string {
  // Phone numbers and URLs are intentionally not translated.
  return `Phone: Medibank OSHC ${OSHC_GENERAL_LINE} | 24/7 Student Health and Support Line ${STUDENT_SUPPORT_LINE}`;
}
