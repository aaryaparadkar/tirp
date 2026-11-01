/**
 * Medibank OSHC "Health support" services, all reached on the free 24/7
 * Student Health and Support Line (1800 887 283):
 * https://www.medibankoshc.com.au/oshc-support/health-support/
 *
 * When a student describes one of these needs in everyday words ("I have a
 * fever", "I'm so stressed", "my landlord won't give my bond back", "I lost
 * my passport"), we answer with what the service does and a one-tap
 * "Call 1800 887 283" button (opens the dialer, never auto-calls).
 *
 * Emergencies are handled before this (Call 000). Insurance questions
 * ("is a fever covered?") are left to the normal cover answers.
 */
import type { SupportedLanguage } from './types.js';

export type SupportServiceKey =
  | 'nurse'
  | 'counselling'
  | 'legal'
  | 'travel_documents'
  | 'interpreter'
  | 'living'
  | 'family_message';

const PATTERNS: Array<[SupportServiceKey, RegExp]> = [
  ['family_message', /\b(tell|message|contact|let|inform|call)\s+(my\s+)?(family|parents|mum|mom|dad|relatives)\b.*\b(accident|hospital|hurt|injur\w*|incident)\b|\b(accident|hospital|incident)\b.*\b(tell|message|contact|inform)\s+(my\s+)?(family|parents|mum|mom|dad)\b/],
  ['travel_documents', /\b(lost|stolen|missing|can'?t\s+find|misplaced)\s+(my\s+)?(passport|travel\s+documents?)\b|\bpassport\s+(is\s+|was\s+|got\s+)?(lost|stolen|missing)\b|\bvisa\s+(was\s+|got\s+|has\s+been\s+)?(cancell?ed|revoked)\b|\btravel\s+documents?\b|护照(丢|被偷|不见)|签证(被)?取消|pasaporte\s+(perdido|robado)|perd[ií]\s+(mi\s+)?pasaporte|visa\s+cancelada/],
  ['legal', /\b(landlord|real\s+estate\s+agent|lease|rental\s+agreement|tenancy|evict(ed|ion)?|my\s+bond|rental\s+bond|bond\s+back|infringement|(parking|speeding|train|transport|myki|opal)\s+fine|got\s+(a\s+)?fined|been\s+fined|legal\s+(advice|help|issue|problem)|need\s+a\s+lawyer|lawyer|solicitor|scammed|being\s+scammed)\b|房东|租约|押金|罚款|律师|法律(咨询|问题)|casero|contrato\s+de\s+alquiler|multa|abogado|asesor[ií]a\s+legal/],
  ['interpreter', /\b(interpreter|translator|translate\s+for\s+me|(don'?t|do\s+not|can'?t)\s+speak\s+(good\s+|much\s+)?english|someone\s+who\s+speaks)\b|口译|翻译|int[eé]rprete|traductor/],
  ['counselling', /\b(stress(ed|ful)?|anxious|anxiety|panic\s+attacks?|depress(ed|ion)|overwhelm(ed|ing)|lonely|loneliness|homesick|can'?t\s+sleep|insomnia|trauma(tic|tised|tized)?|griev(ing)?|grief|burn(ed|t)?\s*out|mental\s+health|counsell?or|counsell?ing|therapist|someone\s+to\s+talk\s+to|feeling\s+(really\s+|so\s+|very\s+)?(down|low|sad|hopeless))\b|压力|焦虑|抑郁|孤独|想家|失眠|心理|estr[eé]s|ansiedad|deprimid[oa]|me\s+siento\s+sol[oa]|nostalgia|insomnio/],
  ['nurse', /\b(fever|(high|running\s+a|have\s+a|got\s+a)\s+temperature|(a|bad|head|chest)\s+cold|caught\s+a\s+cold|flu|influenza|cough(ing)?|sore\s+throat|headache|migraine|vomit(ing)?|throwing\s+up|diarrh(o)?ea|stomach\s+(ache|bug|pain|cramps?)|nause(a|ous)|rash|ear\s*ache|toothache|infection|feel(ing)?\s+(sick|unwell|ill|terrible|awful|rough|crook)|i'?m\s+(sick|unwell|ill)|not\s+feeling\s+(well|good|great)|talk\s+to\s+a\s+nurse|nurse\s+(advice|line)|medical\s+advice|should\s+i\s+see\s+a\s+(doctor|gp))\b|发烧|发热|感冒|咳嗽|头痛|喉咙痛|肚子痛|拉肚子|呕吐|不舒服|生病|fiebre|resfriad[oa]|gripe|\btos\b|dolor\s+de\s+(cabeza|garganta|est[oó]mago)|me\s+siento\s+mal|enferm[oa]/],
  ['living', /\b(open(ing)?\s+a\s+bank\s+account|banking\s+in\s+australia|public\s+transport|myki|opal\s+card|tax\s+file\s+number|\btfn\b|settling\s+in|culture\s+shock|adjust(ing)?\s+to\s+(life\s+in\s+)?australia|living\s+in\s+australia|is\s+it\s+safe\s+to)\b|银行开户|公共交通|cuenta\s+bancaria|transporte\s+p[uú]blico/],
];

/** Same guard as the emergency path: cover/claim/cost questions are not support requests. */
const INSURANCE_QUESTION = /\b(cover(ed|age|s)?|claim\w*|cost\w*|price|how\s+much|reimburs\w*|refund|benefit\w*|includ(e|ed|es)|waiting\s+period)\b|保障|理赔|报销|费用|cobertura|reembolso|cubre/;

export function matchSupportService(text: string): SupportServiceKey | null {
  const t = (text || '').normalize('NFKC').toLowerCase().replace(/[’`]/g, "'");
  if (!t.trim() || INSURANCE_QUESTION.test(t)) return null;
  for (const [key, re] of PATTERNS) if (re.test(t)) return key;
  return null;
}

type Copy = { title: string; body: string; extra?: string };

const COPY: Record<SupportServiceKey, Record<SupportedLanguage, Copy>> = {
  nurse: {
    en: { title: 'Talk to a registered nurse — free, 24/7 🩺', body: 'For a cold, fever, flu, cough or anything you’re unsure about, a nurse can tell you what care you need and whether to see a GP or specialist.', extra: 'Reply *3* to find a GP that’s open near you.' },
    'zh-CN': { title: '咨询注册护士——免费，24/7 🩺', body: '感冒、发烧、咳嗽或任何不确定的情况，护士可以告诉你需要怎样的护理，以及是否需要看 GP 或专科。', extra: '回复 *3* 查找附近正在营业的 GP。' },
    es: { title: 'Habla con una enfermera titulada — gratis, 24/7 🩺', body: 'Para un resfriado, fiebre, gripe, tos o cualquier duda, una enfermera te dice qué atención necesitas y si debes ver a un GP o especialista.', extra: 'Responde *3* para buscar un GP abierto cerca de ti.' },
  },
  counselling: {
    en: { title: 'Stress and trauma counselling — free, 24/7 💙', body: 'Feeling stressed, anxious, homesick or overwhelmed? You can talk to a qualified counsellor on the phone, any time. They can also set up an in-person appointment if it helps.', extra: 'You’re not on your own. If you’re thinking about harming yourself, call *000* now.' },
    'zh-CN': { title: '压力与创伤心理咨询——免费，24/7 💙', body: '感到压力、焦虑、想家或不堪重负？你可以随时通过电话与专业心理咨询师交谈，需要时还可以安排面对面咨询。', extra: '你不是一个人。如果你有伤害自己的念头，请立即拨打 *000*。' },
    es: { title: 'Apoyo psicológico por estrés y trauma — gratis, 24/7 💙', body: '¿Estrés, ansiedad, nostalgia o te sientes desbordado? Puedes hablar por teléfono con un consejero cualificado a cualquier hora, y si ayuda, te organizan una cita en persona.', extra: 'No estás solo. Si piensas en hacerte daño, llama al *000* ahora.' },
  },
  legal: {
    en: { title: 'Emergency legal advice — free, 24/7 ⚖️', body: 'Trouble with a landlord, your bond, a rental agreement or a fine? The support line connects you with a lawyer or expert in that area of law.' },
    'zh-CN': { title: '紧急法律咨询——免费，24/7 ⚖️', body: '房东、押金、租约或罚款问题？支持热线会为你联系相关领域的律师或专家。' },
    es: { title: 'Asesoría legal urgente — gratis, 24/7 ⚖️', body: '¿Problemas con el casero, la fianza, el contrato de alquiler o una multa? La línea te conecta con un abogado o experto en esa área.' },
  },
  travel_documents: {
    en: { title: 'Lost passport or visa problem? 🛂', body: 'The support line helps with travel document issues like a lost or stolen passport or a cancelled visa — any time of day or night.' },
    'zh-CN': { title: '护照丢失或签证问题？🛂', body: '支持热线可协助处理证件问题，例如护照丢失或被盗、签证被取消，全天 24 小时。' },
    es: { title: '¿Pasaporte perdido o problema de visa? 🛂', body: 'La línea ayuda con documentos de viaje, como un pasaporte perdido o robado o una visa cancelada, a cualquier hora.' },
  },
  interpreter: {
    en: { title: 'Free interpreter, 24/7 🗣️', body: 'Call and give your name and preferred language — interpreters cover around 160 languages, and it doesn’t have to be about a medical service.' },
    'zh-CN': { title: '免费口译服务，24/7 🗣️', body: '致电时告知你的姓名和希望使用的语言即可，提供约 160 种语言，不限于医疗服务。' },
    es: { title: 'Intérprete gratis, 24/7 🗣️', body: 'Llama y di tu nombre y tu idioma preferido: hay intérpretes en unos 160 idiomas, y no tiene que ser por un servicio médico.' },
  },
  living: {
    en: { title: 'Help settling into life in Australia 🏙️', body: 'The support line has information on banking, transport, culture and staying safe — handy in your first few weeks.' },
    'zh-CN': { title: '帮助你适应澳大利亚生活 🏙️', body: '支持热线提供银行、交通、文化与安全方面的信息，非常适合刚到的前几周。' },
    es: { title: 'Ayuda para adaptarte a la vida en Australia 🏙️', body: 'La línea tiene información sobre bancos, transporte, cultura y seguridad, muy útil en tus primeras semanas.' },
  },
  family_message: {
    en: { title: 'Get a message to your family 📨', body: 'After an accident or incident, the support line can pass an important message to your family or someone you nominate.', extra: 'If anyone is hurt right now, call *000*.' },
    'zh-CN': { title: '帮你给家人传话 📨', body: '发生事故或意外后，支持热线可以替你向家人或指定的人转达重要信息。', extra: '如果现在有人受伤，请拨打 *000*。' },
    es: { title: 'Haz llegar un mensaje a tu familia 📨', body: 'Tras un accidente o incidente, la línea puede transmitir un mensaje importante a tu familia o a quien indiques.', extra: 'Si alguien está herido ahora, llama al *000*.' },
  },
};

const LINE_TEXT: Record<SupportedLanguage, string> = {
  en: '📞 *24/7 Student Health and Support Line: 1800 887 283* — free for Medibank OSHC members, around 160 languages.',
  'zh-CN': '📞 *24/7 学生健康与支持热线：1800 887 283*——Medibank OSHC 会员免费，约 160 种语言。',
  es: '📞 *Línea 24/7 de Salud y Apoyo: 1800 887 283* — gratis para miembros de Medibank OSHC, en unos 160 idiomas.',
};

export const SUPPORT_SOURCE_URL = 'https://www.medibankoshc.com.au/oshc-support/health-support/';

/** Message body for a support service; the call button is sent with it. */
export function supportServiceMessage(key: SupportServiceKey, lang: SupportedLanguage = 'en'): string {
  const c = COPY[key][lang] || COPY[key].en;
  return [`*${c.title}*`, c.body, LINE_TEXT[lang], c.extra].filter(Boolean).join('\n\n');
}

export function callButtonLabel(lang: SupportedLanguage): string {
  return lang === 'zh-CN' ? '拨打 1800 887 283' : lang === 'es' ? 'Llamar 1800 887 283' : 'Call 1800 887 283';
}
