import { describe, expect, it, beforeEach } from 'vitest';
import { matchSupportService, supportServiceMessage, callButtonLabel } from '../src/support-services.js';
import { supportCallPage, supportCallUrl, STUDENT_HEALTH_LINE, SUPPORT_CALL_PATH } from '../src/support-call-page.js';
import { isEmergency } from '../src/safety.js';

describe('matchSupportService', () => {
  it.each([
    ['I have a fever', 'nurse'],
    ['caught a cold, what should I do', 'nurse'],
    ['I feel sick', 'nurse'],
    ['sore throat since yesterday', 'nurse'],
    ['我发烧了', 'nurse'],
    ['tengo fiebre', 'nurse'],
    ["I'm so stressed about exams", 'counselling'],
    ['feeling homesick and lonely', 'counselling'],
    ['I need someone to talk to', 'counselling'],
    ["my landlord won't give my bond back", 'legal'],
    ['I got a parking fine', 'legal'],
    ['I lost my passport', 'travel_documents'],
    ['my passport was stolen', 'travel_documents'],
    ['I need an interpreter', 'interpreter'],
    ['how do I open a bank account', 'living'],
    ['I had an accident, can you tell my family I am in hospital', 'family_message'],
  ])('%s → %s', (text, key) => {
    expect(matchSupportService(text)).toBe(key);
  });

  it.each(['is a fever covered?', 'how much does a GP cost', "I'm fine thanks", "what's the temperature in melbourne", 'the cold in melbourne is wild', 'hello', ''])(
    'ignores %s',
    (text) => expect(matchSupportService(text)).toBeNull(),
  );

  it('emergencies are still caught first', () => {
    expect(isEmergency('chest pain and I feel sick')).toBe(true);
  });
});

describe('support copy', () => {
  it('includes the number and fits a WhatsApp button', () => {
    for (const lang of ['en', 'zh-CN', 'es'] as const) {
      expect(supportServiceMessage('nurse', lang)).toContain('1800 887 283');
      expect([...callButtonLabel(lang)].length).toBeLessThanOrEqual(20);
    }
  });
});

describe('support call page', () => {
  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = 'https://bot.example.com/';
  });

  it('builds an https bridge URL', () => {
    expect(supportCallUrl(STUDENT_HEALTH_LINE, 'es')).toBe('https://bot.example.com/call/1800887283?lang=es');
  });

  it('no URL without an https base', () => {
    process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
    expect(supportCallUrl(STUDENT_HEALTH_LINE)).toBeNull();
  });

  it('serves a tel: handoff for allow-listed numbers only', async () => {
    const res = supportCallPage(new Request('https://bot.example.com/call/1800887283'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('href="tel:1800887283"');
    expect(SUPPORT_CALL_PATH.test('/call/0412345678')).toBe(false);
    expect(supportCallPage(new Request('https://bot.example.com/call/0412345678')).status).toBe(404);
  });
});
