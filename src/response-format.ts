/**
 * Central WhatsApp response formatter.
 *
 * WhatsApp has no document alignment — "proper alignment" here means a
 * predictable vertical rhythm: title line, blank line, bullets, blank line,
 * next step. This module enforces that shape for every outbound answer.
 */

export const MAX_WHATSAPP_CHARS = 900;
const HARD_CAP = 1500;

const INTERNAL_SOURCE_RE = /\s*\[S\d+\]/g;
const TRIPLE_NEWLINE_RE = /\n{3,}/g;

/** Convert Markdown bold/headers to WhatsApp-safe *bold*. */
function toWhatsAppBold(text: string): string {
  let out = text;
  // ### Heading -> *Heading*
  out = out.replace(/^#{1,4}\s*(.+?)\s*$/gm, '*$1*');
  // **bold** -> *bold* (WhatsApp uses single asterisks)
  out = out.replace(/\*\*(.+?)\*\*/g, '*$1*');
  // __bold__ -> *bold*
  out = out.replace(/__(.+?)__/g, '*$1*');
  return out;
}

/** Normalize bullet markers to a single style: "• ". */
function normalizeBullets(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*)([-*•·▪◦]|(\d+)[.)])\s+(.*\S)\s*$/);
      if (!m) return line;
      const body = m[4];
      // Keep numbered lists as-is (journey steps); normalize the rest.
      if (m[3]) return `${m[1]}${m[3]}. ${body}`;
      return `${m[1]}• ${body}`;
    })
    .join('\n');
}

/** Strip internal retrieval markers like [S1] but keep real URLs/phones. */
function stripInternalMarkers(text: string): string {
  return text.replace(INTERNAL_SOURCE_RE, '');
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(TRIPLE_NEWLINE_RE, '\n\n')
    .trim();
}

/** A line that must keep its own visual line (list, heading, instruction, URL). */
const LIST_LINE_RE = /^\s*(•|[-*·▪◦]\s+|\d+[.)]\s+|[A-Da-d][.)]\s+)/;
function isStructuralLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (LIST_LINE_RE.test(line)) return true;
  if (/^\*.+\*$/.test(t)) return true; // full-line *bold* heading
  if (/^https?:\/\/\S+$/.test(t)) return true;
  if (/^[📚🎉🏆💡🔗⭐⚠️❓✅❌ℹ️✨👉]/.test(t)) return true;
  if (/^\*?(next step|下一步|siguiente paso)/i.test(t)) return true;
  if (/^(sources|资料来源|fuentes)\s*[:：]/i.test(t)) return true;
  if (/^question \d+\s+of\s+\d+$/i.test(t)) return true;
  if (/^(reply|replies|responde|请回复|回复|tap |pulsa|call now|emergency\?)/i.test(t)) return true;
  return false;
}

/**
 * Rejoin soft-wrapped prose into paragraphs. WhatsApp wraps visually on the
 * device, so one-sentence-per-line from the model renders as a ragged,
 * half-width column. Structural lines (lists, headings, instructions, URLs)
 * keep their lines; ordinary prose lines are joined with spaces.
 */
function reflowProse(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let prose: string[] = [];
  const flush = (): void => {
    if (!prose.length) return;
    const joined = prose
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/([\u4e00-\u9fff]) ([\u4e00-\u9fff])/g, '$1$2')
      .replace(/\s+([,.!?;:。、，．；：！？])/g, '$1');
    if (joined) out.push(joined);
    prose = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      out.push('');
      continue;
    }
    if (isStructuralLine(line)) {
      flush();
      out.push(line.trimEnd());
      continue;
    }
    prose.push(line);
  }
  flush();
  return out.join('\n');
}

function truncateAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf('. '));
  const idx = cut > max * 0.5 ? cut + 1 : max;
  return `${text.slice(0, idx).trimEnd()}…`;
}

export interface FormatOptions {
  maxChars?: number;
}

/**
 * Format any assistant answer for WhatsApp: stable structure, safe
 * emphasis, no internal markers, bounded length.
 */
export function formatWhatsAppAnswer(raw: string, opts: FormatOptions = {}): string {
  const max = Math.min(opts.maxChars ?? MAX_WHATSAPP_CHARS, HARD_CAP);
  let out = (raw || '').trim();
  if (!out) return out;
  out = stripInternalMarkers(out);
  out = toWhatsAppBold(out);
  out = normalizeBullets(out);
  out = reflowProse(out);
  out = collapseWhitespace(out);
  out = truncateAtBoundary(out, max);
  return out.trim();
}

/** Split a formatted answer into WhatsApp-sized chunks at blank lines. */
export function chunkForWhatsApp(text: string, limit = 1500): string[] {
  const body = (text || '').trim();
  if (!body) return [];
  if (body.length <= limit) return [body];
  const chunks: string[] = [];
  let rest = body;
  while (rest.length > limit) {
    const slice = rest.slice(0, limit);
    const cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'));
    const idx = cut > limit * 0.35 ? cut : limit;
    chunks.push(rest.slice(0, idx).trim());
    rest = rest.slice(idx).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

export interface FormatIssue {
  code: string;
  detail: string;
}

/** Cheap contract checks used by tests and (optionally) runtime guards. */
export function validateAnswer(text: string, opts: { maxChars?: number } = {}): FormatIssue[] {
  const issues: FormatIssue[] = [];
  const max = opts.maxChars ?? MAX_WHATSAPP_CHARS;
  if (!text.trim()) issues.push({ code: 'empty', detail: 'Answer is empty.' });
  if (text.length > HARD_CAP) issues.push({ code: 'too_long', detail: `Answer is ${text.length} chars (hard cap ${HARD_CAP}).` });
  else if (text.length > max) issues.push({ code: 'long', detail: `Answer is ${text.length} chars (target ${max}).` });
  if (/\[S\d+\]/.test(text)) issues.push({ code: 'internal_marker', detail: 'Contains internal source markers like [S1].' });
  if (/\n{3,}/.test(text)) issues.push({ code: 'spacing', detail: 'Contains 3+ consecutive newlines.' });
  // Ragged "one short sentence per line" prose renders as a half-width column.
  const lines = text.split('\n');
  let shortRun = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      shortRun = 0;
      continue;
    }
    if (isStructuralLine(line) || t.length >= 45) {
      shortRun = 0;
      continue;
    }
    shortRun += 1;
    if (shortRun >= 4) {
      issues.push({ code: 'choppy', detail: 'Contains 4+ consecutive short prose lines; reflow into paragraphs.' });
      break;
    }
  }
  if (/^#{1,4}\s/m.test(text)) issues.push({ code: 'md_heading', detail: 'Contains Markdown # headings (use *bold*).' });
  if (/\*\*.+?\*\*/.test(text)) issues.push({ code: 'md_bold', detail: 'Contains **bold** (use *bold* for WhatsApp).' });
  const disclaimerHits = (text.match(/General information only|仅为来自|Solo información general/gi) || []).length;
  if (disclaimerHits > 1) issues.push({ code: 'disclaimer_dup', detail: 'Disclaimer appears more than once.' });
  return issues;
}

/** Remove duplicate disclaimer lines, keeping the last occurrence. */
export function dedupeDisclaimer(text: string, disclaimer: string): string {
  if (!disclaimer || !text.includes(disclaimer)) return text;
  const parts = text.split(disclaimer);
  if (parts.length <= 2) return text;
  return `${parts.slice(0, -1).join(' ').replace(/\n{3,}/g, '\n\n').trim()}\n\n${disclaimer}${parts[parts.length - 1]}`;
}
