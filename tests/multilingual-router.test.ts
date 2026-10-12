import { describe, expect, it } from 'vitest';
import { resolveContactLanguage } from '../src/webhook.js';
import { answerWithSources, deterministicClassify, resolveMenuSelection } from '../src/router.js';
import type { Database } from '../src/db.js';

function fakeDb(): Database & { locked: Array<{ id: string; lang: string }> } {
  const locked: Array<{ id: string; lang: string }> = [];
  const db = {
    locked,
    async query(text: string, values?: unknown[]) {
      if (/UPDATE contacts SET preferred_language/.test(text)) {
        locked.push({ id: String(values?.[1]), lang: String(values?.[0]) });
        return { rows: [{ preferred_language: values?.[0] }] } as never;
      }
      return { rows: [] } as never;
    },
    async close() {},
  };
  return db;
}

describe('multilingual routing', () => {
  it('resolves friendly phrases in all languages', () => {
    expect(resolveMenuSelection('cobertura')).toBe('coverage');
    expect(resolveMenuSelection('保障范围')).toBe('coverage');
    expect(resolveMenuSelection('reembolso')).toBe('claims');
    expect(resolveMenuSelection('报销')).toBe('claims');
    expect(resolveMenuSelection('药房')).toBe('pharmacy');
    expect(resolveMenuSelection('farmacia')).toBe('pharmacy');
  });
  it('classifies intents in all languages', () => {
    expect(deterministicClassify('¿Dónde hay una farmacia?')?.intent).toBe('pharmacy');
    expect(deterministicClassify('处方药可以报销吗？')?.intent).toBe('pharmacy');
    expect(deterministicClassify('¿Cuál es el período de espera?')?.intent).toBe('waiting_periods');
    expect(deterministicClassify('等待期是多久？')?.intent).toBe('waiting_periods');
  });
  it('locks first-message language and reuses it', async () => {
    const db = fakeDb();
    const contact = { id: 'c1', phone: '+1', name: 'n', locale: 'en_US', preferredLanguage: null, optedIn: true } as never;
    const first = await resolveContactLanguage(db, contact, 'Hola, ¿cómo hago un reclamo?');
    expect(first).toBe('es');
    expect(db.locked).toHaveLength(1);
    // Later English message must still resolve to locked Spanish.
    const second = await resolveContactLanguage(db, contact, 'How do I claim?');
    expect(second).toBe('es');
    expect(db.locked).toHaveLength(1);
  });
  it('does not lock on language-neutral menu taps', async () => {
    const db = fakeDb();
    const contact = { id: 'c2', phone: '+2', name: 'n', locale: 'en_US', preferredLanguage: null, optedIn: true } as never;
    expect(await resolveContactLanguage(db, contact, '2')).toBe('en');
    expect(db.locked).toHaveLength(0);
  });
  it('non-English fallback never dumps raw English excerpts', async () => {
    const saved = process.env.MISTRAL_API_KEYS;
    delete process.env.MISTRAL_API_KEYS;
    delete process.env.MISTRAL_API_KEY;
    const es = await answerWithSources('una pregunta rara sin fuentes', { intent: 'unknown', confidence: 0.3, needsClarification: true, keywords: ['xyzzy-no-match'], source: 'fallback' }, { chunks: [], language: 'es' });
    expect(es.language).toBe('es');
    expect(es.text).toMatch(/Quiero entenderte|No encontré|no puedo generar/);
    const zh = await answerWithSources('一个没有来源的奇怪问题', { intent: 'unknown', confidence: 0.3, needsClarification: true, keywords: ['xyzzy-no-match'], source: 'fallback' }, { chunks: [], language: 'zh-CN' });
    expect(zh.language).toBe('zh-CN');
    expect(zh.text).toMatch(/准确理解|没有找到|暂时无法/);
    if (saved !== undefined) process.env.MISTRAL_API_KEYS = saved;
  });
});
