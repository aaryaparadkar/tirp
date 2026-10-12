import type { Intent, KbChunk, RetrievalResult } from '../types.js';
import { filesForIntent } from './sources.js';

const STOP = new Set(
  'a,an,the,and,or,but,if,then,so,for,to,of,in,on,at,by,with,about,into,over,after,before,my,i,you,we,they,he,she,it,is,are,was,were,be,been,do,does,did,have,has,had,can,could,should,would,what,when,where,which,who,how,why,doesnt,dont,please,tell,me,give,need,want,know'.split(','),
);

export function tokenize(text: string): string[] {
  const base = (text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/'s\b/g, ' ')
    .replace(/[^a-z0-9\s$]/g, ' ')
    .split(/\s+/)
    .map((tok) => tok.trim())
    .filter((tok) => tok.length > 1 && !STOP.has(tok));
  // Add singular variants so "medicines/receipts" match "medicine/receipt".
  const out: string[] = [];
  for (const tok of base) {
    out.push(tok);
    if (tok.length > 4 && tok.endsWith('s') && !tok.endsWith('ss')) {
      const singular = tok.slice(0, -1);
      if (singular.length > 2 && !STOP.has(singular) && !out.includes(singular)) out.push(singular);
    }
  }
  return out;
}

function haystackTokens(hay: string): string[] {
  return hay.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function editDistanceCapped(a: string, b: string, cap = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  if (a.length > 24 || b.length > 24) return cap + 1;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// Intent keyword hints to bias lexical retrieval toward the right documents.
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  greeting: ['hello', 'hi', 'menu', 'start'],
  coverage: ['cover', 'coverage', 'oshc', 'essentials', 'comprehensive', 'hospital', 'medical', 'extras', 'include', 'exclude', 'benefit', 'limit'],
  claims: ['claim', 'claims', 'claiming', 'online', 'receipt', 'invoice', 'form', 'member', 'services', 'portal', 'mail', 'store'],
  reimbursements: ['reimburse', 'reimbursement', 'refund', 'payment', 'paid', 'bank', 'account', 'gap', 'out-of-pocket', 'receipt'],
  healthcare_navigation: ['gp', 'doctor', 'hospital', 'sick', 'healthcare', 'health', 'clinic', 'specialist', 'emergency', 'appointment'],
  providers: ['provider', 'direct', 'billing', 'find', 'clinic', 'members', 'choice', 'hospital', 'hicaps'],
  pharmacy: ['pharmacy', 'prescription', 'medicine', 'pharmaceutical', 'pbs', 'contribution', 'annual', 'limit'],
  medicines: ['medicine', 'prescription', 'drug', 'tablet', 'pharmacy', 'over-the-counter', 'cost'],
  visa_compliance: ['visa', 'subclass', '500', 'condition', '8501', 'compliant', 'requirement', 'home', 'affairs'],
  waiting_periods: ['waiting', 'period', 'pre-existing', 'pre', 'existing', '12', 'month', 'pregnancy'],
  student_rewards: ['reward', 'rewards', 'livebetter', 'live', 'better', 'student', 'plus', 'offer', 'discount', 'perk'],
  updates: ['update', 'news', 'change', 'new', 'announcement', 'offer', 'current'],
  forms_and_guides: ['form', 'brochure', 'guide', 'pdf', 'download', 'member', 'summary', 'authority'],
  support: ['contact', 'support', 'help', 'phone', 'call', 'store', 'message', 'wechat', 'complaint'],
  emergency: ['emergency', 'accident', 'ambulance', '000', 'urgent', 'injured', 'bleeding'],
  unknown: [],
};

export function scoreChunk(chunk: KbChunk, queryTokens: string[], intent: Intent): number {
  const hay = `${chunk.title} ${chunk.heading} ${chunk.content}`.toLowerCase();
  const hayToks = haystackTokens(`${chunk.title} ${chunk.heading} ${chunk.content}`);
  const haySet = new Set(hayToks);
  let score = 0;
  for (const tok of queryTokens) {
    if (!tok) continue;
    const occurrences = hay.split(tok).length - 1;
    if (occurrences > 0) {
      score += Math.min(occurrences, 4) * (tok.length >= 6 ? 2 : 1);
      continue;
    }
    // Typo tolerance for longer tokens: half credit for near-miss in chunk.
    if (tok.length >= 5 && /^[a-z0-9$]+$/.test(tok)) {
      const budget = tok.length <= 6 ? 1 : 2;
      for (const ht of haySet) {
        if (Math.abs(ht.length - tok.length) > budget) continue;
        if (editDistanceCapped(tok, ht, budget) <= budget) {
          score += 0.8;
          break;
        }
      }
    }
  }
  // Heading/title bonus
  const headHay = `${chunk.title} ${chunk.heading}`.toLowerCase();
  for (const tok of queryTokens) {
    if (tok.length >= 4 && headHay.includes(tok)) score += 3;
  }
  // Intent file preference
  const preferred = filesForIntent(intent);
  if (preferred.includes(chunk.file)) score += 6;
  // Intent keyword bonus
  for (const kw of INTENT_KEYWORDS[intent] || []) {
    if (hay.includes(kw)) score += 0.4;
  }
  // Exact phrase bonus for quoted/longer queries
  return score;
}

const MIN_RETRIEVAL_SCORE = 2;

export function retrieve(
  chunks: KbChunk[],
  query: string,
  intent: Intent,
  topK = 4,
): RetrievalResult[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const scored = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, tokens, intent) }))
    .filter((r) => r.score >= MIN_RETRIEVAL_SCORE)
    .sort((a, b) => b.score - a.score);
  // Diversity: avoid returning 4 chunks from the same file when possible.
  const picked: RetrievalResult[] = [];
  const seenFiles = new Map<string, number>();
  for (const r of scored) {
    const count = seenFiles.get(r.chunk.file) || 0;
    if (count >= 2 && picked.length >= 2) continue;
    picked.push(r);
    seenFiles.set(r.chunk.file, count + 1);
    if (picked.length >= topK) break;
  }
  return picked;
}

export function formatSources(results: RetrievalResult[]): { ids: string[]; urls: string[] } {
  const ids: string[] = [];
  const urls: string[] = [];
  for (const r of results) {
    if (!ids.includes(r.chunk.file)) ids.push(r.chunk.file);
    if (r.chunk.url && !urls.includes(r.chunk.url)) urls.push(r.chunk.url);
  }
  return { ids, urls };
}
