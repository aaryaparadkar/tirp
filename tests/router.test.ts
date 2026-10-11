import { describe, expect, it } from 'vitest';
import { classifyIntent, deterministicClassify, resolveMenuSelection, staticAnswerFor } from '../src/router.js';

describe('menu resolution', () => {
  it('maps numbers and button ids', () => {
    expect(resolveMenuSelection('1')).toBe('coverage');
    expect(resolveMenuSelection('2')).toBe('claims');
    expect(resolveMenuSelection('menu:coverage')).toBe('coverage');
    expect(resolveMenuSelection('menu:emergency')).toBe('emergency');
    expect(resolveMenuSelection('menu:rewards')).toBe('student_rewards');
  });
});

describe('deterministic classification', () => {
  it('routes claims and reimbursements', () => {
    expect(deterministicClassify('How do I make a claim online?')?.intent).toBe('claims');
    expect(deterministicClassify('How do I get reimbursed for my GP visit?')?.intent).toBe('reimbursements');
  });
  it('routes coverage, pharmacy, visa, waiting', () => {
    expect(deterministicClassify('What does Comprehensive cover?')?.intent).toBe('coverage');
    expect(deterministicClassify('Are prescription medicines covered?')?.intent).toBe('pharmacy');
    expect(deterministicClassify('Does OSHC satisfy subclass 500?')?.intent).toBe('visa_compliance');
    expect(deterministicClassify('What is the waiting period for pregnancy?')?.intent).toBe('waiting_periods');
  });
  it('routes rewards without LLM', () => {
    expect(deterministicClassify('Where are student rewards?')?.intent).toBe('student_rewards');
  });
});

describe('static answers', () => {
  it('never invents rewards/updates', () => {
    const rewards = staticAnswerFor('student_rewards', 'any')!;
    expect(rewards.text).toContain('https://www.medibank.com.au/livebetter/rewards/');
    const updates = staticAnswerFor('updates', 'any')!;
    expect(updates.text).toMatch(/official/i);
  });
});

describe('classifyIntent without keys falls back to deterministic', () => {
  it('uses deterministic path when no mistral keys', async () => {
    const saved = process.env.MISTRAL_API_KEYS;
    delete process.env.MISTRAL_API_KEYS;
    delete process.env.MISTRAL_API_KEY;
    const res = await classifyIntent('How do I claim a GP visit?');
    expect(['claims', 'reimbursements']).toContain(res.intent);
    if (saved !== undefined) process.env.MISTRAL_API_KEYS = saved;
  });
});
