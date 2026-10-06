import { describe, expect, it } from 'vitest';
import {
  QUIZ_CURRICULUM,
  TOTAL_CURRICULUM_QUESTIONS,
  TOTAL_CURRICULUM_SESSIONS,
  TOTAL_CURRICULUM_XP,
  getSessionConfig,
  getSessionQuestions,
} from '../src/quiz/curriculum.js';
import { QUESTION_BANK } from '../src/quiz/question-bank.js';

describe('Quiz curriculum guarantees', () => {
  it('covers all 32 questions with zero duplicates across sessions', () => {
    const allQuestionIds = QUIZ_CURRICULUM.flatMap((s) => s.questionIds);
    expect(allQuestionIds.length).toBe(TOTAL_CURRICULUM_QUESTIONS);
    expect(allQuestionIds.length).toBe(QUESTION_BANK.length);

    // Strictly disjoint sets: no questions are repeated
    const uniqueIds = new Set(allQuestionIds);
    expect(uniqueIds.size).toBe(QUESTION_BANK.length);
  });

  it('guarantees deterministic, identical sequence for all sessions', () => {
    expect(TOTAL_CURRICULUM_SESSIONS).toBe(7);

    // Session 1: Finding healthcare
    const s1 = getSessionConfig(0);
    expect(s1?.sessionNumber).toBe(1);
    expect(s1?.topic).toBe('finding_healthcare');
    expect(s1?.questionIds).toEqual(['find_hc_1', 'find_hc_2', 'find_hc_3', 'find_hc_4', 'find_hc_5']);

    // Session 2: Emergency care
    const s2 = getSessionConfig(1);
    expect(s2?.sessionNumber).toBe(2);
    expect(s2?.topic).toBe('emergency_care');
    expect(s2?.questionIds).toEqual(['emerg_1', 'emerg_2', 'emerg_3', 'emerg_4', 'emerg_5']);

    // Session 3: Pharmacy
    const s3 = getSessionConfig(2);
    expect(s3?.sessionNumber).toBe(3);
    expect(s3?.topic).toBe('pharmacy');

    // Session 4: Claims
    const s4 = getSessionConfig(3);
    expect(s4?.sessionNumber).toBe(4);
    expect(s4?.topic).toBe('claims');

    // Session 5: Policy
    const s5 = getSessionConfig(4);
    expect(s5?.sessionNumber).toBe(5);
    expect(s5?.topic).toBe('policy_management');

    // Session 6: Advanced navigation
    const s6 = getSessionConfig(5);
    expect(s6?.sessionNumber).toBe(6);
    expect(s6?.topic).toBe('advanced_navigation');

    // Session 7: Mastery review
    const s7 = getSessionConfig(6);
    expect(s7?.sessionNumber).toBe(7);
    expect(s7?.topic).toBe('mastery_review');
    expect(s7?.questionIds).toEqual(['pharm_7', 'claims_7']);

    // Session 8+: Curriculum complete
    expect(getSessionConfig(7)).toBeNull();
  });

  it('retrieves full question objects with options and explanations for each session', () => {
    const s1 = getSessionConfig(0)!;
    const questions = getSessionQuestions(s1);
    expect(questions.length).toBe(5);
    expect(questions[0].id).toBe('find_hc_1');
    expect(questions[0].options.length).toBeGreaterThanOrEqual(4);
    expect(questions[0].correctOptionId).toBe('b');
  });

  it('calculates total XP matching sum of question bank', () => {
    const expectedXp = QUESTION_BANK.reduce((sum, q) => sum + q.xp, 0);
    expect(TOTAL_CURRICULUM_XP).toBe(expectedXp);
  });
});
