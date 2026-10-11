import { EMERGENCY_NUMBER_AU } from './config.js';
import type { SupportedLanguage } from './types.js';

const HIGH_RISK_PATTERNS: RegExp[] = [
  /\bcall\s+(an?\s+)?ambulance\b/i,
  /\bcall\s+000\b/i,
  /\b(out\s+of\s+breath|cannot\s+breathe|can'?t\s+breathe|difficulty\s+breathing|choking)\b/i,
  /\b(unconscious|passed\s+out|fainted\s+and|not\s+waking\s+up|collapsed)\b/i,
  /\b(severe|heavy|serious|uncontrolled)\s+(bleeding|blood\s+loss)\b/i,
  /\b(chest\s+pain|heart\s+attack|stroke)\b/i,
  /\b(serious|bad|major|car|road|bike)\s+(accident|injury|injured|crash)\b/i,
  /\bhad\s+an?\s+accident\b/i,
  /\bi(\s+was|\s+am|\s+have\s+been)?\s+(badly\s+)?injured\b/i,
  /\b(someone\s+is\s+(hurt|injured|bleeding|unconscious)|person\s+is\s+unconscious)\b/i,
  /\b(overdose|suicide|kill\s+myself|self[-\s]?harm|end\s+my\s+life)\b/i,
  /\b(severe\s+allergic|anaphylaxis|epipen)\b/i,
  /\b(seizure|convulsion)\b.*\b(help|now|emergency)\b/i,
  /\bbreak[-\s]?in\b.*\b(help|police|emergency)\b/i,
  /\b(attacked|assaulted|stabbed|shooting|fire)\b.*\b(help|now|emergency|police)\b/i,
  /\burgent\s+(medical\s+)?(help|care|attention|assistance)\b/i,
  /\blife[-\s]?threatening\b/i,
  /\bneed\s+(an?\s+)?ambulance\b/i,
  // Spanish high-risk signals.
  /\b(emergencia|llama(r)?\s+a\s+(una\s+)?ambulancia|necesito\s+una\s+ambulancia)\b/i,
  /\b(no\s+puedo\s+respirar|dificultad\s+para\s+respirar|me\s+estoy\s+asfixiando)\b/i,
  /\b(inconsciente|desmayad[oa]|no\s+despierta|se\s+desplom[oó])\b/i,
  /\b(sangrado\s+grave|hemorragia|dolor\s+en\s+el\s+pecho|ataque\s+al\s+coraz[oó]n)\b/i,
  /\b(accidente\s+grave|tuve\s+un\s+accidente|estoy\s+gravemente\s+herid[oa]|alguien\s+est[aá]\s+herido)\b/i,
  /\b(ayuda\s+urgente|necesito\s+ayuda\s+urgente)\b/i,
];

// Mandarin high-risk substrings (no word boundaries in Chinese).
const ZH_HIGH_RISK = [
  '救命', '紧急', '急救', '救护车', '打000', '拨打000',
  '呼吸困难', '不能呼吸', '无法呼吸', '喘不上气',
  '失去意识', '昏倒', '晕倒', '叫不醒',
  '严重出血', '大出血', '流血不止',
  '胸痛', '胸口痛', '心脏病发',
  '出事故', '发生车祸', '车祸', '严重受伤', '有人受伤', '受重伤',
  '自杀', '自残', '过量服药',
];

const NON_EMERGENCY_GUARD = /\b(mild|slight|a\s+little|minor)\s+(cold|cough|headache|fever|sore\s+throat)\b/i;
const NON_EMERGENCY_GUARD_ES = /\b(leve|ligero|un poco)\s+(resfriado|tos|dolor de cabeza|fiebre|dolor de garganta)\b/i;
const NON_EMERGENCY_GUARD_ZH = /(轻微|有点|小感冒|轻微咳嗽|轻微头痛|低烧|喉咙有点痛)/;

export function isEmergency(text: string): boolean {
  const normalized = (text || '').trim();
  if (!normalized) return false;
  if (ZH_HIGH_RISK.some((w) => normalized.includes(w))) return true;
  if (
    (NON_EMERGENCY_GUARD.test(normalized) || NON_EMERGENCY_GUARD_ES.test(normalized) || NON_EMERGENCY_GUARD_ZH.test(normalized)) &&
    !/\b(breath|unconscious|bleed|chest|accident|ambulance|000|respirar|inconsciente|sangrado|pecho|accidente|ambulancia|呼吸|意识|出血|胸|事故|救护)\b/i.test(normalized)
  ) {
    return false;
  }
  return HIGH_RISK_PATTERNS.some((re) => re.test(normalized));
}

export function emergencyReply(lang: SupportedLanguage = 'en'): string {
  if (lang === 'zh-CN') {
    return (
      `请保持冷静。如果你或附近的人处于危险中，或需要紧急医疗帮助，请立即拨打澳大利亚紧急电话 ${EMERGENCY_NUMBER_AU}。\n\n` +
      `请点击下面的“拨打 ${EMERGENCY_NUMBER_AU}”按钮，或直接在手机上拨打 ${EMERGENCY_NUMBER_AU}。\n\n` +
      `如果可以，请先转移到安全的地方。如果你受了重伤，请不要自己开车。\n` +
      `之后如需非紧急 OSHC 帮助，请回复“菜单”。`
    );
  }
  if (lang === 'es') {
    return (
      `Mantén la calma. Si tú o alguien cercano está en peligro inmediato o necesita ayuda médica urgente, ` +
      `llama ahora al número de emergencias de Australia: ${EMERGENCY_NUMBER_AU}.\n\n` +
      `Pulsa el botón “Llamar al ${EMERGENCY_NUMBER_AU}” o marca ${EMERGENCY_NUMBER_AU} directamente desde tu teléfono.\n\n` +
      `Si puedes, muévete a un lugar seguro. No conduzcas si estás gravemente herido.\n` +
      `Para ayuda no urgente de OSHC después, responde MENÚ.`
    );
  }
  return (
    `Stay calm. If you or someone nearby is in immediate danger or needs urgent medical help, ` +
    `please call Australia's emergency number ${EMERGENCY_NUMBER_AU} right now.\n\n` +
    `Tap the Call ${EMERGENCY_NUMBER_AU} button below, or dial ${EMERGENCY_NUMBER_AU} on your phone.\n\n` +
    `If you can, move to a safe place. Do not drive yourself if you are badly injured.\n` +
    `For non-urgent OSHC help afterwards, reply MENU.`
  );
}

export function emergencyCallText(lang: SupportedLanguage = 'en'): string {
  if (lang === 'zh-CN') return `点击拨打 ${EMERGENCY_NUMBER_AU}（澳大利亚紧急电话），请保持通话。`;
  if (lang === 'es') return `Toca para llamar al ${EMERGENCY_NUMBER_AU} (emergencia de Australia) ahora. No cuelgues.`;
  return `Tap to call ${EMERGENCY_NUMBER_AU} (Australia emergency) now. Stay on the line.`;
}

export function isGreeting(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  if (/^(hi|hii+|hello|hey|yo|hola|start|menu|menú|help|ayuda|options|opciones|catalogue|catalog|services?|servicios?)$/i.test(t)) return true;
  if (/^(你好|您好|嗨|哈喽|菜单|帮助|开始)\W*$/u.test((text || '').trim())) return true;
  if (/^good\s*(morning|afternoon|evening)$/i.test(t)) return true;
  if (/^(buenos d[ií]as|buenas tardes|buenas noches)\W*$/i.test(t)) return true;
  if (/^(namaste|assalam.*|sat\s*sri\s*akal)$/i.test(t)) return true;
  return false;
}
