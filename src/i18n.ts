import { OSHC_GENERAL_LINE, STUDENT_SUPPORT_LINE } from './config.js';
import type { Intent, SupportedLanguage } from './types.js';

export type TranslationKey =
  | 'greeting'
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
  | 'askVerifyUpdate';

const STRINGS: Record<SupportedLanguage, Record<TranslationKey, string>> = {
  en: {
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
    support:
      `Here's how to reach a person:\n\n` +
      `Contact Medibank OSHC: https://www.medibankoshc.com.au/contact-us/\n` +
      `Find a direct-billing provider: https://www.medibankoshc.com.au/find-provider/\n` +
      `Find a Members Choice provider: https://www.medibank.com.au/health-insurance/find-provider/\n` +
      `Online Member Services login: https://www.members.medibankoshc.com.au/login.html\n` +
      `Online claim form: https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
      `\nPhone: Medibank OSHC 134 148 | 24/7 Student Health and Support Line 1800 887 283`,
    emptyMessage: 'I got an empty message. Reply MENU to see what I can help with.',
    fallbackUnknown:
      `I couldn't find that in the Medibank OSHC sources I have. ` +
      `Try asking about cover, claims, providers, pharmacy, visa, waiting periods, rewards, forms, or reply MENU.\n\n` +
      `For personal help: https://www.medibankoshc.com.au/contact-us/ or 134 148.`,
    fallbackNoSources:
      `I couldn't find that in the Medibank OSHC sources I have. ` +
      `Try asking about cover, claims, providers, pharmacy, visa, waiting periods, rewards, forms, or reply MENU.\n\n` +
      `For personal help: https://www.medibankoshc.com.au/contact-us/ or 134 148.`,
    fallbackLlmUnavailable:
      `我暂时无法用中文生成可靠的完整答案。请查看以下 Medibank OSHC 官方信息，或联系 Medibank OSHC 获取帮助：`,
    menuFooter: 'Medibank OSHC • general info only',
    chooseTopic: 'Choose topic',
    replyMenuHint: 'Reply MENU anytime',
    sourcesLabel: 'Sources:',
    claimForms:
      `For OSHC claims use the online paths first:\n` +
      `• Online Member Services: https://www.members.medibankoshc.com.au/login.html\n` +
      `• Online claim form: https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
      `• Mail: Medibank OSHC, GPO 2984 Melbourne Vic 3001 (with claim form + receipts)\n` +
      `• In-store: any Medibank store with receipts\n\n` +
      `Other forms/brochures: https://www.medibank.com.au/health-insurance/using-your-cover/brochures-forms/\n` +
      `OSHC info: https://www.medibankoshc.com.au/oshc-support/oshc-information/`,
    askVerifyUpdate: `Tell me what update you heard about (e.g. price, cover change, app change) and I'll explain how to verify it for your policy.`,
  },
  'zh-CN': {
    greeting:
      `你好，我是 Medibank OSHC 学生助手。我可以帮助你：\n\n` +
      `1. 了解你的 OSHC 保障范围（Essentials 与 Comprehensive）\n` +
      `2. 理赔和报销\n` +
      `3. 查找医疗服务和直付（direct billing）医疗机构\n` +
      `4. 药房和处方药\n` +
      `5. 签证要求和等待期\n` +
      `6. 学生奖励和福利\n` +
      `7. Medibank 重要更新\n` +
      `8. 表格和会员指南\n` +
      `9. 紧急健康问题或事故\n\n` +
      `请回复数字（1-9）、点击选项，或直接输入你的问题。\n` +
      `我只提供来自 Medibank OSHC 官方资料的一般信息，不能诊断病情，也不能确认你个人的理赔结果。`,
    disclaimer: '仅为来自 Medibank OSHC 资料的一般信息，不是医疗建议。如需确认个人保障或理赔结果，请联系 Medibank OSHC。',
    support:
      `你可以通过以下方式联系人工客服：\n\n` +
      `联系 Medibank OSHC：https://www.medibankoshc.com.au/contact-us/\n` +
      `查找直付医疗机构：https://www.medibankoshc.com.au/find-provider/\n` +
      `查找 Members Choice 医疗机构：https://www.medibank.com.au/health-insurance/find-provider/\n` +
      `在线会员服务登录：https://www.members.medibankoshc.com.au/login.html\n` +
      `在线理赔表：https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
      `\n电话：Medibank OSHC 134 148｜24/7 学生健康与支持热线 1800 887 283`,
    emptyMessage: '我收到了一条空消息。请回复“菜单”查看我可以帮你做什么。',
    fallbackUnknown:
      `我在现有的 Medibank OSHC 资料中没有找到相关内容。` +
      `你可以询问保障范围、理赔、医疗机构、药房、签证、等待期、学生奖励、表格，或回复“菜单”。\n\n` +
      `如需人工帮助：https://www.medibankoshc.com.au/contact-us/ 或致电 134 148。`,
    fallbackNoSources:
      `我在现有的 Medibank OSHC 资料中没有找到相关内容。` +
      `你可以询问保障范围、理赔、医疗机构、药房、签证、等待期、学生奖励、表格，或回复“菜单”。\n\n` +
      `如需人工帮助：https://www.medibankoshc.com.au/contact-us/ 或致电 134 148。`,
    fallbackLlmUnavailable:
      `我暂时无法用中文生成可靠的完整答案。请查看以下 Medibank OSHC 官方信息，或联系 Medibank OSHC 获取帮助：`,
    menuFooter: 'Medibank OSHC • 仅为一般信息',
    chooseTopic: '选择主题',
    replyMenuHint: '随时回复“菜单”',
    sourcesLabel: '资料来源：',
    claimForms:
      `办理 OSHC 理赔请优先使用线上渠道：\n` +
      `• 在线会员服务：https://www.members.medibankoshc.com.au/login.html\n` +
      `• 在线理赔表：https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
      `• 邮寄：Medibank OSHC, GPO 2984 Melbourne Vic 3001（附理赔表和收据）\n` +
      `• 到店：携带收据前往任意 Medibank 门店\n\n` +
      `其他表格/手册：https://www.medibank.com.au/health-insurance/using-your-cover/brochures-forms/\n` +
      `OSHC 信息：https://www.medibankoshc.com.au/oshc-support/oshc-information/`,
    askVerifyUpdate: '请告诉我你听到的更新内容（例如价格、保障变化、App 变化），我会告诉你如何针对你的保单进行核实。',
  },
  es: {
    greeting:
      `Hola, soy el asistente estudiantil de Medibank OSHC. Puedo ayudarte con:\n\n` +
      `1. Entender tu cobertura OSHC (Essentials y Comprehensive)\n` +
      `2. Reclamaciones y reembolsos\n` +
      `3. Buscar atención médica y proveedores con facturación directa\n` +
      `4. Farmacias y medicamentos\n` +
      `5. Requisitos de visa y períodos de espera\n` +
      `6. Recompensas y beneficios para estudiantes\n` +
      `7. Actualizaciones importantes de Medibank\n` +
      `8. Formularios y guías para miembros\n` +
      `9. Problemas de salud urgentes o accidentes\n\n` +
      `Responde con un número (1-9), selecciona una opción o escribe tu pregunta.\n` +
      `Solo brindo información general de fuentes oficiales de Medibank OSHC; no puedo diagnosticar ni confirmar el resultado de tu reclamación individual.`,
    disclaimer: 'Solo información general de fuentes de Medibank OSHC. No es asesoramiento médico. Para decisiones sobre tu cobertura o reclamación, contacta con Medibank OSHC.',
    support:
      `Así puedes contactar con una persona:\n\n` +
      `Contactar con Medibank OSHC: https://www.medibankoshc.com.au/contact-us/\n` +
      `Buscar un proveedor con facturación directa: https://www.medibankoshc.com.au/find-provider/\n` +
      `Buscar un proveedor Members Choice: https://www.medibank.com.au/health-insurance/find-provider/\n` +
      `Acceso a Online Member Services: https://www.members.medibankoshc.com.au/login.html\n` +
      `Formulario de reclamación en línea: https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
      `\nTeléfono: Medibank OSHC 134 148 | Línea de salud y apoyo estudiantil 24/7: 1800 887 283`,
    emptyMessage: 'Recibí un mensaje vacío. Responde MENÚ para ver en qué puedo ayudarte.',
    fallbackUnknown:
      `No encontré eso en las fuentes de Medibank OSHC que tengo. ` +
      `Puedes preguntar sobre cobertura, reclamaciones, proveedores, farmacia, visa, períodos de espera, recompensas, formularios o responder MENÚ.\n\n` +
      `Para ayuda personal: https://www.medibankoshc.com.au/contact-us/ o llama al 134 148.`,
    fallbackNoSources:
      `No encontré eso en las fuentes de Medibank OSHC que tengo. ` +
      `Puedes preguntar sobre cobertura, reclamaciones, proveedores, farmacia, visa, períodos de espera, recompensas, formularios o responder MENÚ.\n\n` +
      `Para ayuda personal: https://www.medibankoshc.com.au/contact-us/ o llama al 134 148.`,
    fallbackLlmUnavailable:
      `Por el momento no puedo generar una respuesta completa y fiable en español. Consulta la información oficial de Medibank OSHC o contacta con Medibank OSHC:`,
    menuFooter: 'Medibank OSHC • solo información general',
    chooseTopic: 'Elige un tema',
    replyMenuHint: 'Responde MENÚ cuando quieras',
    sourcesLabel: 'Fuentes:',
    claimForms:
      `Para reclamaciones de OSHC usa primero las vías en línea:\n` +
      `• Online Member Services: https://www.members.medibankoshc.com.au/login.html\n` +
      `• Formulario de reclamación en línea: https://www.members.medibankoshc.com.au/login/submit-claim.html\n` +
      `• Por correo: Medibank OSHC, GPO 2984 Melbourne Vic 3001 (con formulario y recibos)\n` +
      `• En tienda: cualquier tienda Medibank con tus recibos\n\n` +
      `Otros formularios/folletos: https://www.medibank.com.au/health-insurance/using-your-cover/brochures-forms/\n` +
      `Información de OSHC: https://www.medibankoshc.com.au/oshc-support/oshc-information/`,
    askVerifyUpdate: 'Dime qué actualización escuchaste (por ejemplo, precio, cambio de cobertura, cambio en la app) y te explicaré cómo verificarla para tu póliza.',
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

const MENU_LABELS: Record<SupportedLanguage, Array<{ label: string; description: string }>> = {
  en: [
    { label: 'Understand my OSHC cover', description: 'Essentials vs Comprehensive inclusions' },
    { label: 'Claims and reimbursements', description: 'How to claim and get paid back' },
    { label: 'Find healthcare / providers', description: 'GPs, direct billing, hospitals' },
    { label: 'Pharmacy and medicines', description: 'Prescriptions and limits' },
    { label: 'Visa and waiting periods', description: 'Subclass 500 and waiting times' },
    { label: 'Student rewards', description: 'Rewards and benefits' },
    { label: 'Important updates', description: 'Current Medibank updates' },
    { label: 'Forms and member guides', description: 'Forms, PDFs, cover summaries' },
    { label: 'Urgent health / accident', description: 'Call 000 immediately' },
  ],
  'zh-CN': [
    { label: '了解 OSHC 保障', description: 'Essentials 与 Comprehensive 对比' },
    { label: '理赔和报销', description: '如何理赔并拿回费用' },
    { label: '查找医疗服务', description: 'GP、直付诊所、医院' },
    { label: '药房和处方药', description: '处方药额度和限制' },
    { label: '签证和等待期', description: '500 签证和等待时间' },
    { label: '学生奖励', description: '奖励和福利' },
    { label: '重要更新', description: 'Medibank 最新通知' },
    { label: '表格和会员指南', description: '表格、PDF、保障摘要' },
    { label: '紧急情况求助', description: '立即拨打 000' },
  ],
  es: [
    { label: 'Entender mi cobertura', description: 'Essentials y Comprehensive' },
    { label: 'Reclamos y reembolsos', description: 'Cómo reclamar y recibir pagos' },
    { label: 'Buscar atención médica', description: 'GP, facturación directa' },
    { label: 'Farmacia y medicamentos', description: 'Recetas y límites' },
    { label: 'Visa y períodos de espera', description: 'Subclase 500 y esperas' },
    { label: 'Recompensas estudiantiles', description: 'Recompensas y beneficios' },
    { label: 'Actualizaciones', description: 'Noticias actuales de Medibank' },
    { label: 'Formularios y guías', description: 'Formularios, PDF, resúmenes' },
    { label: 'Salud urgente / accidente', description: 'Llama al 000 ahora' },
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

export function supportLineFor(_lang: SupportedLanguage): string {
  // Phone numbers and URLs are intentionally not translated.
  return `Phone: Medibank OSHC ${OSHC_GENERAL_LINE} | 24/7 Student Health and Support Line ${STUDENT_SUPPORT_LINE}`;
}
