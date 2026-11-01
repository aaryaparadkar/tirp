/**
 * Plain-language red-flag symptom detection.
 *
 * People in trouble don't say "chest pain"; they say "not feeling too good in
 * my chest", "my heart feels weird", "it's hard to breathe". The fixed phrase
 * list in safety.ts misses those, so the message fell through to "I'm not
 * sure what you're asking". This module pairs a RED-FLAG AREA (chest, heart,
 * breathing, …) with ANY sign of distress ("not good", "weird", "tight",
 * "hurts", …), typo-tolerant, and treats a handful of stand-alone phrases
 * (stroke signs, fainting, crisis language) as urgent on their own.
 *
 * It deliberately errs on the side of showing the Call 000 button: a false
 * positive costs one extra message, a false negative can cost a life.
 * Insurance questions ("Is a chest x-ray covered?") are excluded by the
 * caller via INSURANCE_QUESTION in safety.ts.
 */
import { typoDistance } from './input-normalization.js';

export interface SymptomMatch {
  urgent: boolean;
  /** Short operator-facing reason, e.g. "chest + distress". */
  reason?: string;
}

/** Areas where "something feels off" warrants 000. */
const AREAS: Record<string, string[]> = {
  chest: ['chest', 'chests', 'ribs', 'sternum'],
  heart: ['heart', 'heartbeat', 'heartbeats', 'pulse', 'palpitations', 'palpitation'],
  breathing: ['breathe', 'breathing', 'breath', 'breathless', 'lungs', 'lung', 'airway', 'wheezing', 'wheeze', 'gasping', 'suffocating', 'choking'],
};

/** Distress words: any of these next to an area = urgent. */
const DISTRESS_WORDS = [
  'pain', 'painful', 'hurt', 'hurts', 'hurting', 'ache', 'aching', 'aches', 'sore',
  'tight', 'tightness', 'pressure', 'heavy', 'heaviness', 'squeezing', 'squeeze', 'crushing',
  'burning', 'stabbing', 'sharp', 'weird', 'strange', 'funny', 'off', 'wrong', 'bad', 'worse',
  'racing', 'pounding', 'fluttering', 'skipping', 'irregular', 'fast',
  'swelling', 'swollen', 'closing', 'numb', 'numbness', 'tingling',
  'discomfort', 'uncomfortable', 'struggling', 'struggle', 'hard', 'difficult', 'difficulty',
  'short', 'shortness', 'trouble', 'cant', 'cannot', 'unable', 'stopped',
];

/** Strong distress: still urgent even in a "cold/cough" context. */
const STRONG_WORDS = [
  'pain', 'painful', 'hurt', 'hurts', 'hurting', 'tight', 'tightness', 'pressure', 'heavy', 'heaviness', 'squeezing',
  'crushing', 'stabbing', 'racing', 'pounding', 'irregular', 'numb', 'cant', 'cannot', 'unable', 'stopped',
];

/** Everyday, usually minor contexts ("bad chest cold", "chesty cough"). */
const BENIGN_CONTEXT = /\b(cold|colds|cough|coughing|flu|congestion|congested|phlegm|mucus|snot|sniffles|runny|hay\s*fever|sinus)\b/;

/** Not a symptom at all. */
const NOT_SYMPTOMS = /\bbad\s+breath\b|\bbreath\s*(mints?|freshener)\b|\bheart\s*broken\b|\bbroke\s+my\s+heart\b|\bbreathing\s+(exercises?|techniques?)\b/;

/** Multi-word distress phrasings. */
const DISTRESS_PHRASES = [
  /\bnot\s+(feeling\s+)?(too\s+|so\s+|very\s+)?(good|great|right|ok|okay|well|normal)\b/,
  /\bdoesn'?t\s+feel\s+(right|good|normal|ok|okay)\b/,
  /\bfeels?\s+(off|wrong|weird|strange|funny|bad|tight|heavy)\b/,
  /\bsomething('?s|\s+is)?\s+(wrong|off|not\s+right)\b/,
  /\bcan'?t\s+(catch|get)\s+(my\s+)?breath\b/,
  /\bout\s+of\s+breath\b/,
];

/** Urgent on their own, no area needed. */
const STANDALONE: Array<[RegExp, string]> = [
  [/\b(face|mouth)\s+(is\s+)?(drooping|droopy|numb)\b|\bslurr(ed|ing)\b|\bcan'?t\s+(move|feel)\s+(my\s+)?(arm|leg|face|one\s+side)\b|\bone\s+side\s+(of\s+my\s+(body|face)\s+)?(is\s+)?(numb|weak)\b/, 'stroke signs'],
  [/\b(worst|sudden|severe|terrible|exploding)\s+headache\b/, 'severe headache'],
  [/\b(fainted|passed\s+out|blacked\s+out|collapsed|keep\s+fainting|about\s+to\s+(faint|pass\s+out)|going\s+to\s+(faint|pass\s+out))\b/, 'fainting'],
  [/\b(don'?t|do\s+not)\s+want\s+to\s+(live|be\s+alive|be\s+here)\b|\bno\s+reason\s+to\s+live\b|\b(end|ending)\s+(it\s+all|my\s+life|things)\b|\bcan'?t\s+go\s+on\b|\bbetter\s+off\s+dead\b|\b(kill|hurt|harm)(ing)?\s+myself\b|\bsuicid\w*/, 'crisis language'],
  [/\b(took|taken|swallowed)\s+(too\s+many|a\s+lot\s+of|loads\s+of|the\s+whole)\b|\btoo\s+many\s+(pills|tablets)\b/, 'possible overdose'],
  [/\b(won'?t|will\s+not|doesn'?t|does\s+not)\s+stop\s+bleeding\b|\bbleeding\s+(a\s+lot|heavily|badly|everywhere)\b|\b(lots|loads)\s+of\s+blood\b|\bcoughing\s+(up\s+)?blood\b|\bvomiting\s+blood\b/, 'heavy bleeding'],
  [/\b(hit|banged|smashed)\s+my\s+head\b.*\b(dizzy|confused|vomit\w*|throw\w*\s+up|sleepy|blurry|bleeding)\b/, 'head injury'],
  [/\b(lips?|tongue|throat|face)\s+(is\s+|are\s+)?(swelling|swollen|closing)\b/, 'allergic reaction'],
  [/\b(seizure|fitting|convulsing|convulsions)\b/, 'seizure'],
];

function tokens(text: string): string[] {
  return text.replace(/[^a-z0-9'\s]/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
}

/** Exact or typo-tolerant word match (1 edit up to 7 letters, 2 beyond). */
function matches(token: string, word: string): boolean {
  if (token === word) return true;
  if (word.length < 5 || token.length < 4) return false;
  if (token[0] !== word[0]) return false;
  const budget = word.length <= 7 ? 1 : 2;
  return Math.abs(token.length - word.length) <= budget && typoDistance(token, word) <= budget;
}

function findArea(words: string[]): string | null {
  for (const [area, list] of Object.entries(AREAS)) {
    if (words.some((w) => list.some((term) => matches(w, term)))) return area;
  }
  return null;
}

/** Assess free text for red-flag symptoms described in everyday words. */
export function assessSymptoms(input: string): SymptomMatch {
  const text = (input || '').normalize('NFKC').toLowerCase().replace(/[’`]/g, "'");
  if (!text.trim()) return { urgent: false };

  for (const [re, reason] of STANDALONE) {
    if (re.test(text)) return { urgent: true, reason };
  }

  if (NOT_SYMPTOMS.test(text)) return { urgent: false };
  const words = tokens(text);
  const area = findArea(words);
  if (!area) return { urgent: false };

  // A chesty cold is not a cardiac event unless there's real pain/tightness.
  if (BENIGN_CONTEXT.test(text)) {
    const strong =
      words.some((w) => STRONG_WORDS.some((d) => matches(w, d))) ||
      /\b(can'?t|cannot|hard\s+to|struggling\s+to)\s+breath/.test(text);
    return strong ? { urgent: true, reason: `${area} + strong distress` } : { urgent: false };
  }

  const distress =
    DISTRESS_PHRASES.some((re) => re.test(text)) ||
    words.some((w) => DISTRESS_WORDS.some((d) => matches(w, d)));
  if (distress) return { urgent: true, reason: `${area} + distress` };

  // Breathing trouble words carry the distress themselves.
  if (area === 'breathing' && words.some((w) => ['breathless', 'gasping', 'suffocating', 'choking', 'wheezing'].some((t) => matches(w, t)))) {
    return { urgent: true, reason: 'breathing difficulty' };
  }
  return { urgent: false };
}
