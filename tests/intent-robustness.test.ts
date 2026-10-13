import { describe, expect, it } from 'vitest';
import { classifyIntent, deterministicClassify } from '../src/router.js';

describe('intent disambiguation', () => {
  it('routes hospital billing questions to claims, not providers', () => {
    expect(deterministicClassify('Can I claim my hospital bill?')?.intent).toBe('claims');
  });
  it('routes money-back questions to reimbursements', () => {
    expect(deterministicClassify('When will I get my money back for my GP visit?')?.intent).toBe('reimbursements');
  });
  it('routes location seeking to providers', () => {
    expect(deterministicClassify('Find a direct-billing GP near me')?.intent).toBe('providers');
    expect(deterministicClassify('Hospital near me?')?.intent).toBe('providers');
  });
  it('routes care-seeking to healthcare navigation', () => {
    expect(deterministicClassify('I feel sick, what should I do?')?.intent).toBe('healthcare_navigation');
    expect(deterministicClassify('I have a fever, where should I go?')?.intent).toBe('healthcare_navigation');
  });
  it('routes coverage and pharmacy questions correctly', () => {
    expect(deterministicClassify('What does Comprehensive cover?')?.intent).toBe('coverage');
    expect(deterministicClassify('What medicines are covered?')?.intent).toBe('pharmacy');
  });
  it('attaches the matching rule for diagnostics', () => {
    expect(deterministicClassify('Can I claim my hospital bill?')?.rule).toBe('claims');
    expect(deterministicClassify('Find a direct-billing GP near me')?.rule).toBe('providers-location');
  });
  it('leaves genuinely ambiguous domain questions for the LLM/clarification path', () => {
    // "contact support" inside a claims question must not hard-route to support.
    expect(deterministicClassify('How do I contact support for a claim?')?.intent).toBe('claims');
  });
});

describe('classifyIntent hardening', () => {
  it('falls back to deterministic without keys', async () => {
    const savedKeys = process.env.MISTRAL_API_KEYS;
    const savedKey = process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_API_KEYS;
    delete process.env.MISTRAL_API_KEY;
    const res = await classifyIntent('Can I claim my hospital bill?');
    expect(res.intent).toBe('claims');
    expect(res.source).toBe('deterministic');
    if (savedKeys !== undefined) process.env.MISTRAL_API_KEYS = savedKeys;
    if (savedKey !== undefined) process.env.MISTRAL_API_KEY = savedKey;
  });
});
