/**
 * Input normalization + typo tolerance.
 *
 * Goals:
 * - Minor spelling mistakes, casing, punctuation and extra whitespace
 *   must not break menu selection or intent routing.
 * - Original user text is preserved for LLM/retrieval; normalized text
 *   is used only for matching.
 * - No auto-correction of names, URLs, policy IDs or medical terms —
 *   only intent/menu keyword matching is fuzzy.
 */

/** NFKC + trim + collapse internal whitespace. */
export function normalizeInput(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/**
 * Canonical form for matching: lowercased (locale-aware for EN/ES),
 * punctuation stripped except CJK characters, menu:ids and digits kept.
 */
export function canonicalizeForMatch(text: string): string {
  const normalized = normalizeInput(text).toLowerCase();
  // Keep letters (incl. accents), numbers, CJK, ':' (menu ids), spaces.
  return normalized
    .replace(/[^a-z0-9áéíóúüñ:\u4e00-\u9fff\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Cap length to keep matching cheap.
  if (a.length > 32 || b.length > 32) return Number.MAX_SAFE_INTEGER;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Optimal-string-alignment distance: Levenshtein + adjacent transposition
 * counted as ONE edit. "cliam"→"claim" is 1, so typo budgets can stay tight
 * without rejecting the most common fat-finger mistake.
 */
export function typoDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length > 32 || b.length > 32) return Number.MAX_SAFE_INTEGER;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Escape a literal for use in a RegExp. */
function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whole-word containment with common English inflections: "claim" matches
 * "claims"/"claimed"/"claiming" but NOT "recover"→"cover" or "format"→"form".
 */
export function containsWord(haystack: string, word: string): boolean {
  const w = word.toLowerCase();
  if (!w) return false;
  // CJK has no word boundaries.
  if (/[\u4e00-\u9fff]/.test(w)) return haystack.includes(w);
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}(s|es|ed|d|ing)?(?![\\p{L}\\p{N}])`, 'iu');
  return re.test(haystack);
}

function maxTypoDistance(keyword: string): number {
  if (keyword.length <= 4) return 0; // too short — exact only (avoids false positives)
  if (keyword.length <= 7) return 1;
  return 2;
}

/** True if any whitespace-separated token matches keyword within typo budget. */
export function fuzzyTokenMatch(canonicalHaystack: string, keyword: string): boolean {
  const key = keyword.toLowerCase();
  if (!key) return false;
  if (containsWord(canonicalHaystack, key)) return true;
  const budget = maxTypoDistance(key);
  if (budget === 0) return false;
  const tokens = canonicalHaystack.split(' ');
  for (const tok of tokens) {
    if (!tok) continue;
    // Skip tokens whose length differs too much — cheap prune.
    if (Math.abs(tok.length - key.length) > budget) continue;
    // First letter must match: real typos rarely change it, while
    // "love"/"cover" or "fever"/"cover" differ exactly there.
    if (tok[0] !== key[0]) continue;
    if (typoDistance(tok, key) <= budget) return true;
  }
  return false;
}

/** True if haystack contains any of the keywords (exact or typo-tolerant). */
export function fuzzyContainsAny(canonicalHaystack: string, keywords: string[]): boolean {
  return keywords.some((k) => fuzzyTokenMatch(canonicalHaystack, k));
}

/** Common typo/command variants for top-level commands. Canonical input expected. */
const COMMAND_ALIASES: Record<string, string[]> = {
  menu: ['menu', 'menue', 'meniu', 'meun', 'menus', 'menú', 'menos'],
  start: ['start', 'strat', 'strt', 'inicio', 'empezar', '开始'],
  help: ['help', 'hep', 'hepl', 'ayuda', 'ayua', '帮助', '帮忙'],
  support: ['support', 'suport', 'suppot', 'soporte', 'sopote', '客服'],
  claim: ['claim', 'cliam', 'calim', 'claims', 'reclamo'],
  cover: ['cover', 'covre', 'covergae', 'coverage', 'cobertura'],
  pharmacy: ['pharmacy', 'pharmcy', 'farmcy', 'farmacia', 'farmaica'],
  reimbursement: ['reimbursement', 'reimbursment', 'reimburse', 'refund', 'reembolso'],
  provider: ['provider', 'provdier', 'proveedor', 'provedor'],
  visa: ['visa', 'vissa', 'visado', '签证'],
  emergency: ['emergency', 'emergancy', 'emergencia', 'emergecia', '紧急'],
};

export function resolveCommandAlias(canonical: string): string | null {
  const token = canonical.trim().toLowerCase();
  if (!token || token.includes(' ')) return null;
  for (const [cmd, variants] of Object.entries(COMMAND_ALIASES)) {
    if (variants.includes(token)) return cmd;
  }
  // Typos: transposition counts as one edit, so budgets stay tight —
  // 1 edit for words up to 6 letters, 2 for longer ones. Short tokens
  // need the same first letter ("love" must not become "cover").
  if (token.length < 4) return null;
  for (const [cmd, variants] of Object.entries(COMMAND_ALIASES)) {
    for (const v of variants) {
      if (/[\u4e00-\u9fff]/.test(v)) continue;
      const budget = v.length <= 6 ? 1 : 2;
      if (Math.abs(token.length - v.length) > budget) continue;
      if (token.length <= 6 && token[0] !== v[0]) continue;
      if (typoDistance(token, v) <= budget) return cmd;
    }
  }
  return null;
}

/**
 * True if a multi-word canonical string contains a known variant of the
 * command — exact substring or per-token typo match. Used so sentences like
 * "How do I cliam for GP?" still route without LLM help.
 */
export function containsCommandVariant(canonical: string, cmd: string): boolean {
  const variants = COMMAND_ALIASES[cmd];
  if (!variants) return false;
  if (variants.some((v) => containsWord(canonical, v))) return true;
  const tokens = canonical.split(' ').filter(Boolean);
  for (const tok of tokens) {
    if (tok.length < 4) continue;
    for (const v of variants) {
      if (/[\u4e00-\u9fff]/.test(v)) continue;
      const budget = v.length <= 6 ? 1 : 2;
      if (Math.abs(tok.length - v.length) > budget) continue;
      if (tok[0] !== v[0]) continue;
      if (typoDistance(tok, v) <= budget) return true;
    }
  }
  return false;
}

/** Colloquial English/Spanish phrases mapped to extra retrieval keywords. */
const PHRASE_ALIASES: Array<{ re: RegExp; extra: string }> = [
  { re: /money\s*back|get\s*paid|paid\s*back/i, extra: 'reimbursement refund bank account' },
  { re: /see\s*(a\s*)?doctor|see\s*(a\s*)?gp|need\s*(a\s*)?doctor/i, extra: 'provider direct billing clinic gp' },
  { re: /what\s*do\s*i\s*get|what('s| is)\s*(covered|included)/i, extra: 'coverage essentials comprehensive include' },
  { re: /how\s*long.*(wait|cover)|when.*(start|cover)/i, extra: 'waiting period' },
  { re: /where.*(buy|get).*(medicine|prescription)|chemist/i, extra: 'pharmacy prescription' },
  { re: /ver\s*(a\s*)?un\s*(doctor|m[eé]dico)|necesito\s*(un\s*)?(doctor|m[eé]dico)/i, extra: 'proveedor facturacion directa clinica' },
  { re: /cu[aá]nto\s*(me\s*)?(devuelven|reembolsan)/i, extra: 'reembolso' },
];

export function expandQueryWithAliases(question: string): string {
  let extra = '';
  for (const { re, extra: e } of PHRASE_ALIASES) {
    if (re.test(question)) extra += ` ${e}`;
  }
  return extra ? `${question} ${extra}` : question;
}
