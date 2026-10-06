import { describe, expect, it, vi } from 'vitest';
import { OshcQuizFlow } from '../src/quiz/flow.js';
import type { Database } from '../src/db.js';

vi.mock('../src/kapso.js', () => ({
  sendText: vi.fn().mockResolvedValue({ message_id: 'mock-id' }),
  sendFlow: vi.fn().mockResolvedValue({ message_id: 'mock-flow-id' }),
  createKapsoClient: vi.fn(),
}));

describe('OshcQuizFlow WhatsApp Flow', () => {
  it('defines valid Meta Flow v7.3 structure with LESSON and QUIZ screens', () => {
    const mockDb: Database = { query: vi.fn(), close: vi.fn() };
    const flow = new OshcQuizFlow(mockDb);

    expect(flow.name).toBe('oshc_quiz_flow');
    const def = flow.definition();

    expect(def.version).toBe('7.3');
    expect(def.dataApiVersion).toBe('3.0');
    expect(def.routingModel).toEqual({
      LESSON: ['QUIZ'],
      QUIZ: [],
    });

    expect(def.screens.length).toBe(2);

    const lessonScreen = def.screens[0];
    expect(lessonScreen.id).toBe('LESSON');
    expect(lessonScreen.terminal).toBe(false);

    const quizScreen = def.screens[1];
    expect(quizScreen.id).toBe('QUIZ');
    expect(quizScreen.terminal).toBe(true);
  });

  it('accepts both explicit flowName and correlated flowToken', () => {
    const mockDb: Database = { query: vi.fn(), close: vi.fn() };
    const flow = new OshcQuizFlow(mockDb);

    expect(flow.accepts({ flowName: 'oshc_quiz_flow' }, { phone: '+15551234567', data: {} })).toBe(true);
    expect(flow.accepts({ flowName: 'flow', flowToken: 'oshc_quiz_flow:sess123:user456' }, { phone: '+15551234567', data: {} })).toBe(true);
    expect(flow.accepts({ flowName: 'other_flow' }, { phone: '+15551234567', data: {} })).toBe(false);
  });

  it('grades submitted answers, updates XP, and completes session', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const mockDb: Database = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        // Return mock active session
        if (text.includes("FROM quiz_sessions WHERE contact_id = $1 AND status = 'active'")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: 'sess-test',
                question_ids: ['find_hc_1', 'find_hc_2', 'find_hc_3', 'find_hc_4', 'find_hc_5'],
                earned_xp: 0,
              },
            ],
          } as any;
        }
        // Return mock user state before
        if (text.includes('SELECT earned_question_ids FROM user_quiz_state WHERE contact_id = $1')) {
          return { rowCount: 1, rows: [{ earned_question_ids: [] }] } as any;
        }
        // Return mock user state after
        if (text.includes('SELECT earned_question_ids, completed_sessions FROM user_quiz_state WHERE contact_id = $1')) {
          return { rowCount: 1, rows: [{ earned_question_ids: ['find_hc_1', 'find_hc_2'], completed_sessions: 1 }] } as any;
        }
        return { rowCount: 1, rows: [] } as any;
      }),
      close: vi.fn(),
    };

    const flow = new OshcQuizFlow(mockDb);

    // find_hc_1 correct is 'b', find_hc_2 correct is 'b', find_hc_3 correct is 'a', find_hc_4 correct is 'b', find_hc_5 correct is 'a'
    const submission = {
      flowName: 'oshc_quiz_flow',
      q1: 'b', // correct
      q2: 'b', // correct
      q3: 'wrong', // incorrect
      q4: 'wrong', // incorrect
      q5: 'wrong', // incorrect
    };

    await flow.handle(submission, {
      phone: '+15551234567',
      contactId: 'contact-test',
      data: submission,
    });

    // Check that submissions were inserted
    expect(queries.some((q) => q.text.includes('INSERT INTO flow_submissions'))).toBe(true);

    // Check that user_quiz_state earned questions were updated
    expect(queries.some((q) => q.text.includes('UPDATE user_quiz_state SET earned_question_ids'))).toBe(true);

    // Check that completed_sessions was incremented
    expect(queries.some((q) => q.text.includes('completed_sessions = completed_sessions + 1'))).toBe(true);

    // Check that quiz_sessions was completed
    expect(queries.some((q) => q.text.includes("status = 'completed'"))).toBe(true);
  });
});
