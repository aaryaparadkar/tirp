import { describe, expect, it } from 'vitest';
import { getMenuOptions, t } from '../src/i18n.js';
import { fitTitle, WA_LIMITS } from '../src/kapso.js';
import { PROVIDER_TYPES } from '../src/providers/search.js';
import type { SupportedLanguage } from '../src/types.js';

const LANGS: SupportedLanguage[] = ['en', 'zh-CN', 'es'];
const len = (s: string) => [...s].length;

describe('WhatsApp menu labels fit without truncation', () => {
  it.each(LANGS)('%s menu rows fit list rows AND buttons', (lang) => {
    for (const o of getMenuOptions(lang)) {
      expect(len(o.label), o.label).toBeLessThanOrEqual(WA_LIMITS.buttonTitle);
      expect(len(o.description), o.description).toBeLessThanOrEqual(WA_LIMITS.rowDescription);
      expect(fitTitle(o.label, WA_LIMITS.buttonTitle)).toBe(o.label);
    }
    expect(len(t(lang, 'chooseTopic'))).toBeLessThanOrEqual(WA_LIMITS.listButton);
    expect(len(t(lang, 'menuFooter'))).toBeLessThanOrEqual(WA_LIMITS.footer);
  });

  it('provider-type rows fit', () => {
    PROVIDER_TYPES.forEach((p, i) => {
      expect(len(`${i + 1}. ${p.short}`)).toBeLessThanOrEqual(WA_LIMITS.rowTitle);
      expect(len(p.description)).toBeLessThanOrEqual(WA_LIMITS.rowDescription);
    });
  });

  it('safety net never cuts mid-word', () => {
    expect(fitTitle('Find healthcare / providers', 24)).toBe('Find healthcare…');
    expect(fitTitle('Claims and reimbursements', 24)).toBe('Claims and…');
    expect(fitTitle('Short', 24)).toBe('Short');
    expect(len(fitTitle('Supercalifragilisticexpialidocious', 20))).toBe(20);
  });

  it('full menu text uses the same numbering/wording as the rows', () => {
    expect(t('en', 'fullMenu')).toMatch(/3\. Find a doctor or clinic/);
    expect(t('en', 'greeting')).toMatch(/3\. Find a doctor or clinic/);
  });
});
