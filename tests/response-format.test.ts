import { describe, expect, it } from 'vitest';
import { chunkForWhatsApp, formatWhatsAppAnswer, validateAnswer } from '../src/response-format.js';

describe('prose reflow for WhatsApp rendering', () => {
  it('joins one-sentence-per-line model output into paragraphs', () => {
    const raw = 'Yes, OSHC covers GP visits.\nYou can see any GP.\nBring your membership card.';
    const out = formatWhatsAppAnswer(raw);
    expect(out).toBe('Yes, OSHC covers GP visits. You can see any GP. Bring your membership card.');
    expect(validateAnswer(out).map((i) => i.code)).not.toContain('choppy');
  });
  it('flags ragged short-line prose', () => {
    const issues = validateAnswer('Line one here.\nLine two here.\nLine three now.\nLine four ends.');
    expect(issues.map((i) => i.code)).toContain('choppy');
  });
  it('preserves bullets, headings, and instructions', () => {
    const raw = '*Claim online first:*\n\n• Member Services: https://example.com/a\n• Claim form: https://example.com/b\n\n*Next step:* reply CLAIM.';
    const out = formatWhatsAppAnswer(raw);
    expect(out).toContain('• Member Services: https://example.com/a');
    expect(out).toContain('• Claim form: https://example.com/b');
    expect(out).toContain('*Next step:*');
  });
  it('does not break URLs or CJK text', () => {
    const out = formatWhatsAppAnswer('请查看官方页面。\nhttps://www.medibankoshc.com.au/contact-us/\n请回复菜单。');
    expect(out).toContain('https://www.medibankoshc.com.au/contact-us/');
    expect(out).not.toMatch(/([\u4e00-\u9fff]) ([\u4e00-\u9fff])/);
  });
  it('keeps quiz question structure intact', () => {
    const raw = '*Question 1 of 5*\nWhat is a GP?\n\nA. General Practitioner\nB. Emergency Room\nC. Pharmacist\nD. Dentist\n\nReply with A, B, C, or D.';
    const out = formatWhatsAppAnswer(raw);
    expect(out).toContain('*Question 1 of 5*');
    expect(out).toContain('A. General Practitioner');
    expect(out).toContain('Reply with A, B, C, or D.');
  });
  it('chunks long formatted answers', () => {
    const chunks = chunkForWhatsApp(`${'Para one. '.repeat(100)}\n\n${'Para two. '.repeat(100)}`, 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
  });
});
