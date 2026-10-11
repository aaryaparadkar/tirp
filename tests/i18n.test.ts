import { describe, expect, it } from 'vitest';
import { getMenuOptions, t } from '../src/i18n.js';
import { answerMessages } from '../src/llm/prompts.js';
import { staticAnswerFor } from '../src/router.js';
import { emergencyReply, isEmergency } from '../src/safety.js';

describe('localized greetings and menus', () => {
  it('all languages have nine options and stable intents', () => {
    for (const lang of ['en', 'zh-CN', 'es'] as const) {
      const opts = getMenuOptions(lang);
      expect(opts).toHaveLength(9);
      expect(opts.map((o) => o.intent)).toEqual([
        'coverage', 'claims', 'providers', 'pharmacy', 'visa_compliance',
        'student_rewards', 'updates', 'forms_and_guides', 'emergency',
      ]);
      expect(t(lang, 'greeting')).toContain('1.');
      expect(t(lang, 'greeting')).toContain('9.');
    }
  });
  it('menu labels are actually translated', () => {
    expect(getMenuOptions('zh-CN')[0].label).not.toBe(getMenuOptions('en')[0].label);
    expect(getMenuOptions('es')[0].label).not.toBe(getMenuOptions('en')[0].label);
  });
});

describe('localized emergency', () => {
  it('detects multilingual emergencies', () => {
    expect(isEmergency('我出事故了，需要帮助')).toBe(true);
    expect(isEmergency('我呼吸困难')).toBe(true);
    expect(isEmergency('Tuve un accidente grave')).toBe(true);
    expect(isEmergency('No puedo respirar')).toBe(true);
    expect(isEmergency('我有点感冒怎么办？')).toBe(false);
    expect(isEmergency('Tengo un resfriado leve')).toBe(false);
  });
  it('emergency replies are localized and contain 000', () => {
    for (const lang of ['en', 'zh-CN', 'es'] as const) {
      const reply = emergencyReply(lang);
      expect(reply).toContain('000');
    }
    expect(emergencyReply('zh-CN')).toMatch(/保持冷静/);
    expect(emergencyReply('es')).toMatch(/Mantén la calma/);
    expect(emergencyReply('en')).toMatch(/Stay calm/);
  });
});

describe('localized static answers', () => {
  it('support answers stay in-language', () => {
    expect(staticAnswerFor('support', 'x', 'zh-CN')!.text).toMatch(/人工客服|联系/);
    expect(staticAnswerFor('support', 'x', 'es')!.text).toMatch(/contactar/);
    expect(staticAnswerFor('support', 'x', 'en')!.text).toMatch(/reach a person/);
  });
  it('rewards never invent offers and keep official URL', () => {
    for (const lang of ['en', 'zh-CN', 'es'] as const) {
      const ans = staticAnswerFor('student_rewards', 'x', lang)!;
      expect(ans.language).toBe(lang);
      expect(ans.text).toContain('https://www.medibank.com.au/livebetter/rewards/');
    }
  });
});

describe('answer prompt language', () => {
  it('instructs the model to answer only in the user language', () => {
    const msgs = answerMessages('¿Cómo reclamo?', 'claims', [], [], 'es');
    expect(msgs[0].content).toMatch(/user language is: es/i);
    expect(msgs[0].content).toMatch(/only in that language/i);
    const zh = answerMessages('如何理赔？', 'claims', [], [], 'zh-CN');
    expect(zh[0].content).toMatch(/Simplified Chinese/);
  });
});
