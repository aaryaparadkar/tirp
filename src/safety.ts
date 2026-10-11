import { EMERGENCY_NUMBER_AU } from './config.js';

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
];

// Mild-symptom phrases that must NOT trigger emergency on their own.
const NON_EMERGENCY_GUARD = /\b(mild|slight|a\s+little|minor)\s+(cold|cough|headache|fever|sore\s+throat)\b/i;

export function isEmergency(text: string): boolean {
  const normalized = (text || '').trim();
  if (!normalized) return false;
  if (NON_EMERGENCY_GUARD.test(normalized) && !/\b(breath|unconscious|bleed|chest|accident|ambulance|000)\b/i.test(normalized)) {
    return false;
  }
  return HIGH_RISK_PATTERNS.some((re) => re.test(normalized));
}

export function emergencyReply(): string {
  return (
    `Stay calm. If you or someone nearby is in immediate danger or needs urgent medical help, ` +
    `please call Australia's emergency number ${EMERGENCY_NUMBER_AU} right now.\n\n` +
    `Tap the Call ${EMERGENCY_NUMBER_AU} button below, or dial ${EMERGENCY_NUMBER_AU} on your phone.\n\n` +
    `If you can, move to a safe place. Do not drive yourself if you are badly injured.\n` +
    `For non-urgent OSHC help afterwards, reply MENU.`
  );
}

export function isGreeting(text: string): boolean {
  return /^(hi|hii+|hello|hey|yo|hola|start|menu|help|options|catalogue|catalog|services?|good\s*(morning|afternoon|evening)|namaste|assalam.*|sat\s*sri\s*akal)$/i.test(
    (text || '').trim().toLowerCase(),
  );
}
