import { describe, expect, it } from 'vitest';
import { deterministicClassify } from '../src/router.js';
import { isEmergency } from '../src/safety.js';
import { assessSymptoms } from '../src/symptoms.js';

const emergency = (t: string) => isEmergency(t) || deterministicClassify(t)?.intent === 'emergency';

describe('everyday red-flag symptom phrasing → Call 000', () => {
  it.each([
    'i am not feeling too good in my chest',
    'my chest feels weird',
    "there's pressure on my chest",
    'my heart is racing and i feel dizzy',
    'my heart feels funny',
    "it's hard to breathe",
    'cant catch my breath',
    'im short of breath',
    'my brething is weird',
    'my chets hurts',
    'something is wrong with my heart',
    'my face is drooping',
    'my speech is slurred',
    "i can't move my arm",
    'worst headache of my life',
    "i think i'm going to pass out",
    'my lips are swelling',
    "i don't want to live anymore",
    'i took too many pills',
    "i hit my head and now i'm dizzy",
    'i keep coughing blood',
    'my chest hurts when i cough',
  ])('%s', (text) => {
    expect(emergency(text)).toBe(true);
  });
});

describe('not emergencies', () => {
  it.each([
    'i have a sore throat',
    'i have bad breath',
    'i have a bad chest cold',
    'chesty cough for a week',
    'is a chest x-ray covered?',
    'does oshc cover heart surgery?',
    'my heart rate monitor broke',
    'I feel sick, what should I do?',
    'heartbroken after exams lol',
    'where can i do breathing exercises',
    'my heart is set on studying here',
    'i need a chest of drawers',
    'just take a deep breath and relax',
    "i'm not feeling well",
    'my stomach hurts',
  ])('%s', (text) => {
    expect(emergency(text)).toBe(false);
  });
});

describe('assessSymptoms reasons', () => {
  it('explains what matched', () => {
    expect(assessSymptoms('i am not feeling too good in my chest')).toEqual({ urgent: true, reason: 'chest + distress' });
    expect(assessSymptoms('my face is drooping').reason).toBe('stroke signs');
  });
});
