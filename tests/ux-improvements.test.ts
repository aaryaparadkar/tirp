import { describe, expect, it } from 'vitest';
import { canonicalizeForMatch, fuzzyContainsAny, normalizeInput, resolveCommandAlias } from '../src/input-normalization.js';
import { formatWhatsAppAnswer, validateAnswer } from '../src/response-format.js';
import { getQuickMenuOptions, t } from '../src/i18n.js';
import { answerMessages } from '../src/llm/prompts.js';
import { answerWithSources, clarificationAnswer, deterministicClassify, resolveMenuSelection, staticAnswerFor } from '../src/router.js';

describe('input normalization + typo tolerance', () => {
  it('normalizes whitespace and punctuation', () => {
    expect(normalizeInput('  Claim??  ')).toBe('Claim??');
    expect(canonicalizeForMatch('  Claim??  ')).toBe('claim');
    expect(canonicalizeForMatch('MENU:coverage')).toBe('menu:coverage');
  });
  it('resolves single-word typos to commands', () => {
    expect(resolveCommandAlias('cliam')).toBe('claim');
    expect(resolveCommandAlias('covergae')).toBe('cover');
    expect(resolveCommandAlias('suport')).toBe('support');
    expect(resolveCommandAlias('pharmcy')).toBe('pharmacy');
  });
  it('fuzzy-matches intent keywords with small typos', () => {
    expect(fuzzyContainsAny('how do i reimbursment', ['reimbursement'])).toBe(true);
    expect(fuzzyContainsAny('covrage question', ['coverage'])).toBe(true);
    expect(fuzzyContainsAny('xyzzy', ['coverage'])).toBe(false);
  });
  it('routes misspelled menu phrases to the right intent', () => {
    expect(resolveMenuSelection('cliam')).toBe('claims');
    expect(resolveMenuSelection('How do I cliam for GP?')).toBe('claims');
    expect(resolveMenuSelection('covergae')).toBe('coverage');
    expect(resolveMenuSelection('pharmcy')).toBe('pharmacy');
    expect(resolveMenuSelection('suport')).toBe('support');
    expect(resolveMenuSelection('HELP')).toBe('support');
    expect(resolveMenuSelection('reembolso')).toBe('claims');
  });
  it('classifies misspelled questions without LLM', () => {
    expect(deterministicClassify('How do I get reimbursment?')?.intent).toBe('reimbursements');
    expect(deterministicClassify('What does my covrage include?')?.intent).toBe('coverage');
    expect(deterministicClassify('Where is the pharmcy?')?.intent).toBe('pharmacy');
  });
});

describe('WhatsApp response formatting', () => {
  it('converts markdown bold/headings to WhatsApp bold', () => {
    expect(formatWhatsAppAnswer('**hello**')).toBe('*hello*');
    expect(formatWhatsAppAnswer('### Title\nbody')).toContain('*Title*');
  });
  it('normalizes bullets and strips internal markers', () => {
    const out = formatWhatsAppAnswer('- a\n* b\n[S1] keep [S2]');
    expect(out).toContain('• a');
    expect(out).toContain('• b');
    expect(out).not.toMatch(/\[S\d+\]/);
  });
  it('collapses excess blank lines and bounds length', () => {
    expect(formatWhatsAppAnswer('a\n\n\n\nb')).toBe('a\n\nb');
    expect(formatWhatsAppAnswer('x'.repeat(5000))).toHaveLength(900 + 1); // default target + ellipsis
    expect(formatWhatsAppAnswer('x'.repeat(5000), { maxChars: 5000 })).toHaveLength(1500 + 1); // hard cap + ellipsis
    expect(validateAnswer('ok *bold*')).toEqual([]);
    expect(validateAnswer('**bad**\n\n\n\nx [S1]').map((i) => i.code)).toEqual(
      expect.arrayContaining(['md_bold', 'spacing', 'internal_marker']),
    );
  });
});

describe('concise answer contract', () => {
  it('answer prompt enforces short formatted replies', () => {
    const sys = answerMessages('q', 'claims', [], [], 'en')[0].content;
    expect(sys).toMatch(/RESPONSE CONTRACT/);
    expect(sys).toMatch(/\*bold\*/);
    expect(sys).toMatch(/Next step/);
    expect(sys).toMatch(/Never emit internal markers/);
  });
  it('static answers stay short, formatted, with a next step', () => {
    const support = staticAnswerFor('support', 'x', 'en')!;
    expect(support.text.length).toBeLessThan(700);
    expect(support.text).toMatch(/\*Need a person\?\*/);
    expect(support.text).toMatch(/\*Next step:\*/);
    const rewards = staticAnswerFor('student_rewards', 'x', 'en')!;
    expect(rewards.text.length).toBeLessThan(600);
    const forms = staticAnswerFor('forms_and_guides', 'how to claim?', 'en')!;
    expect(forms.text).toMatch(/\*Next step:\*/);
  });
  it('first-run greeting is a 5-goal journey with HELP/MENU/000', () => {
    for (const lang of ['en', 'zh-CN', 'es'] as const) {
      const g = t(lang, 'greeting');
      expect(g.length).toBeLessThan(600);
      expect(g).toMatch(/\*/); // key content highlighted
      expect(getQuickMenuOptions(lang)).toHaveLength(5);
    }
    expect(t('en', 'greeting')).toMatch(/HELP.*MENU|MENU.*HELP/);
    expect(t('en', 'greeting')).toContain('000');
    expect(t('en', 'fullMenu')).toContain('9.');
  });
  it('low-confidence unknown input gets clarification choices', async () => {
    const savedKeys = process.env.MISTRAL_API_KEYS;
    const savedKey = process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_API_KEYS;
    delete process.env.MISTRAL_API_KEY;
    const ans = await answerWithSources(
      'asdf qwer zxcv',
      { intent: 'unknown', confidence: 0.3, needsClarification: true, keywords: [], source: 'fallback' },
      { chunks: [], language: 'en' },
    );
    expect(ans.text).toMatch(/1\..*2\..*3\./s);
    expect(clarificationAnswer('en').text).toMatch(/1, 2, or 3/);
    if (savedKeys !== undefined) process.env.MISTRAL_API_KEYS = savedKeys;
    if (savedKey !== undefined) process.env.MISTRAL_API_KEY = savedKey;
  });
});
