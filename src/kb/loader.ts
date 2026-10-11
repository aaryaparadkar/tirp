import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { KbChunk } from '../types.js';
import { KB_SOURCES } from './sources.js';

function sourceMeta(file: string): { title: string; url: string } {
  const found = KB_SOURCES.find((s) => s.file === file);
  return {
    title: found?.title || file,
    url: found?.url || '',
  };
}

export function kbDir(base = process.cwd()): string {
  return path.join(base, 'kb');
}

export function stripBoilerplate(markdown: string): string {
  // KB exports contain site nav repeated at the top and cookie/footer at bottom.
  // Keep the substantive middle: start at first real content heading (H1-H3),
  // skipping nav headings like Help & support / Contact us / Main menu / Log in.
  const lines = markdown.split('\n');
  const SKIP_HEADINGS = /^(help & support|contact us|main menu|log in|popular searches|forms and brochures|# forms)/i;
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#{1,3}\s+\S/.test(t) && !SKIP_HEADINGS.test(t.replace(/^#{1,3}\s+/, ''))) {
      // Require some substantive body text nearby to avoid nav anchors.
      const nextBody = lines.slice(i + 1, i + 6).join(' ').trim();
      if (nextBody.length > 40 || /^#\s+\S/.test(t)) {
        start = i;
        break;
      }
    }
  }
  const sliced = lines.slice(start).join('\n');
  return sliced
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^Our website uses cookies/i.test(t)) return false;
      if (/^(Dismiss|Back to homepage|Back to top|Back to guides)$/i.test(t)) return false;
      if (/^!\[Image \d+/.test(t) && t.length < 220) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chunkDocument(
  file: string,
  title: string,
  url: string,
  markdown: string,
  maxChars = 2800,
  overlap = 250,
): KbChunk[] {
  const clean = stripBoilerplate(markdown);
  const sections = clean.split(/(?=^#{1,4} )/m).map((s) => s.trim()).filter(Boolean);
  // Drop leading nav preamble before the first heading (common in Medibank exports).
  if (sections.length > 1 && !/^#{1,4}\s/.test(sections[0])) sections.shift();
  const chunks: KbChunk[] = [];
  let counter = 0;
  for (const section of sections) {
    const headingMatch = section.match(/^#{1,4}\s+(.+)/);
    const heading = headingMatch ? headingMatch[1].trim().slice(0, 160) : title;
    if (section.length <= maxChars) {
      chunks.push({ id: `${file}#${counter++}`, file, title, url, heading, content: section });
    } else {
      let i = 0;
      while (i < section.length) {
        const piece = section.slice(i, i + maxChars);
        chunks.push({ id: `${file}#${counter++}`, file, title, url, heading, content: piece });
        i += maxChars - overlap;
      }
    }
  }
  return chunks.filter((c) => c.content.trim().length > 120);
}

export async function loadKbChunks(dir?: string): Promise<KbChunk[]> {
  const kb = dir || kbDir();
  const files = (await readdir(kb)).filter((f) => f.endsWith('.md')).sort();
  const out: KbChunk[] = [];
  for (const file of files) {
    // Skip cover-summary PDF-converted placeholder if missing; loader tolerates any md.
    const raw = await readFile(path.join(kb, file), 'utf8');
    const meta = sourceMeta(file);
    const titleMatch = raw.match(/^Title:\s*(.+)$/m);
    const urlMatch = raw.match(/^URL Source:\s*(.+)$/m);
    out.push(
      ...chunkDocument(
        file,
        (titleMatch?.[1] || meta.title).trim(),
        (urlMatch?.[1] || meta.url).trim(),
        raw,
      ),
    );
  }
  return out;
}

let cache: KbChunk[] | null = null;

export async function cachedKbChunks(dir?: string): Promise<KbChunk[]> {
  if (cache && !dir) return cache;
  const chunks = await loadKbChunks(dir);
  if (!dir) cache = chunks;
  return chunks;
}

export function clearKbCache(): void {
  cache = null;
}
