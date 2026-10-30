import { describe, expect, it } from 'vitest';
import { emergencyCallPage, emergencyCallUrl } from '../src/emergency-page.js';
import { containsWord, resolveCommandAlias, typoDistance } from '../src/input-normalization.js';
import { assessLegibility } from '../src/legibility.js';
import { cleanExcerpt, deterministicClassify } from '../src/router.js';
import { isEmergency } from '../src/safety.js';
import { isOnboardCommand, parseStudentName } from '../src/onboarding/self-service.js';

describe('legibility gate', () => {
  it.each(['asdfgh', 'jkjkjk lol', 'xyzzy qwrt', 'ffff', 'hgfd sdfg?', '.....', '🤔🤔', '12345678', 'sdkjfh sdkjfh'])('illegible: %s', (t) => {
    expect(assessLegibility(t).legible).toBe(false);
  });
  it.each(['hi', 'ok', 'thanks', 'hw to clam', 'wat is oshc', 'mujhe doctor chahiye', '¿qué cubre mi seguro?', '我要理赔', '5', 'Is the $1,000 limit per year?'])('legible: %s', (t) => {
    expect(assessLegibility(t).legible).toBe(true);
  });
});

describe('intent matching does not over-fire', () => {
  it.each([
    'i love my mother', 'recover my password', 'discover melbourne', 'format my essay',
    'information please', 'i am waiting for the bus',
  ])('%s → no topic', (t) => {
    expect(deterministicClassify(t)).toBeNull();
  });
  it('single-word typos still resolve, unrelated words do not', () => {
    expect(resolveCommandAlias('cliam')).toBe('claim');
    expect(resolveCommandAlias('covre')).toBe('cover');
    expect(resolveCommandAlias('love')).toBeNull();
    expect(resolveCommandAlias('fever')).toBeNull();
    expect(resolveCommandAlias('hello')).toBeNull();
  });
  it('typo recall on full questions', () => {
    expect(deterministicClassify('how do i cliam for gp')?.intent).toBe('claims');
    expect(deterministicClassify('vissa rules')?.intent).toBe('visa_compliance');
    expect(deterministicClassify('direct-billing clinic')?.intent).toBe('providers');
  });
  it('helpers', () => {
    expect(typoDistance('cliam', 'claim')).toBe(1);
    expect(containsWord('how many claims', 'claim')).toBe(true);
    expect(containsWord('recover', 'cover')).toBe(false);
  });
});

describe('emergency detection', () => {
  it.each([
    'i cant breath', 'my friend is not breathing', 'he is unconcious', 'EMERGENCY', 'this is an emergency',
    'call ambulence', 'im having a heart attack', 'got hit by a car', 'someone is attacking me', 'bleeding a lot',
    'my house is on fire', 'I think I broke my leg',
  ])('emergency: %s', (t) => {
    expect(isEmergency(t) || deterministicClassify(t)?.intent === 'emergency').toBe(true);
  });
  it.each([
    'Is an ambulance covered?', 'Does OSHC cover emergency department visits?', 'Is the $1,000 limit per year?',
    'how much is ambulance cover', 'claim for emergency room bill',
  ])('not emergency: %s', (t) => {
    expect(isEmergency(t) || deterministicClassify(t)?.intent === 'emergency').toBe(false);
  });
});

describe('call 000 page', () => {
  it('builds an https button URL only when PUBLIC_BASE_URL is https', () => {
    const saved = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = 'https://oshc.example.com/';
    expect(emergencyCallUrl('es')).toBe('https://oshc.example.com/call/000?lang=es');
    process.env.PUBLIC_BASE_URL = 'http://insecure.example.com';
    expect(emergencyCallUrl()).toBeNull();
    process.env.PUBLIC_BASE_URL = saved;
  });
  it('page opens tel:000 (dialer only) and never calls anything else', async () => {
    const res = emergencyCallPage(new Request('https://x/call/000?lang=en'));
    const html = await res.text();
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(html).toContain('href="tel:000"');
    expect(html).toContain('"tel:000"');
    expect(html.match(/tel:[^"]+/g)?.every((m) => m === 'tel:000')).toBe(true);
  });
});

describe('onboarding parsing', () => {
  it('detects the command', () => {
    for (const t of ['onboard', 'ONBOARDING', 'onbaord', 'sign up', 'register']) expect(isOnboardCommand(t)).toBe(true);
    for (const t of ['hello', 'board', 'menu']) expect(isOnboardCommand(t)).toBe(false);
  });
  it('extracts names', () => {
    expect(parseStudentName('my name is john smith')).toBe('John Smith');
    expect(parseStudentName("I'm Mei-Ling")).toBe('Mei-Ling');
    expect(parseStudentName('王小明')).toBe('王小明');
    expect(parseStudentName('how do i claim?')).toBeNull();
    expect(parseStudentName('123')).toBeNull();
    expect(parseStudentName('a b c d e f')).toBeNull();
  });
});

describe('KB excerpt cleanup', () => {
  it('joins hard wraps and cuts at a sentence', () => {
    const raw = 'Changes to the terms and conditions of\n\nyour membership.\nThe terms may\nvary from time to time. It is your responsibility to keep up to date with everything in this guide and more text here.';
    const out = cleanExcerpt(raw, 90);
    expect(out).not.toMatch(/may\nvary/);
    expect(out.endsWith('.')).toBe(true);
  });
});
