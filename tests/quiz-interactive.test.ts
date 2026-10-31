import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db.js';

const out: Array<{ kind: string; body: string; ids?: string[] }> = [];

vi.mock('../src/kapso.js', () => ({
  sendText: vi.fn(async (_p: string, _to: string, body: string) => { out.push({ kind: 'text', body }); }),
  sendList: vi.fn(async (_p: string, _to: string, body: string, _btn: string, sections: Array<{ rows: Array<{ id: string }> }>) => {
    out.push({ kind: 'list', body, ids: sections.flatMap((s) => s.rows.map((r) => r.id)) });
  }),
  sendButtons: vi.fn(async (_p: string, _to: string, body: string, buttons: Array<{ id: string }>) => {
    out.push({ kind: 'buttons', body, ids: buttons.map((b) => b.id) });
  }),
  sendFlow: vi.fn(),
}));

const { answerQuiz, handleQuizText, startQuizForContact } = await import('../src/quiz/service.js');
const { QUESTION_BANK } = await import('../src/quiz/question-bank.js');

const contact = { id: 'c1', phone: '+61400000000' };

function fakeDb(active: { question_ids: string[]; current_index: number } | null) {
  const session = active ? { id: 's1', earned_xp: 0, ...active } : null;
  return {
    async query(sql: string) {
      const s = sql.replace(/\s+/g, ' ');
      if (s.includes("FROM quiz_sessions WHERE contact_id = $1 AND status = 'active'")) {
        if (!session) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ ...session }] };
      }
      if (s.startsWith('SELECT topic, question_ids, current_index FROM quiz_sessions')) {
        return { rowCount: 1, rows: session ? [{ topic: 't', ...session }] : [] };
      }
      if (s.startsWith('SELECT earned_question_ids, completed_sessions')) {
        return { rowCount: 1, rows: [{ earned_question_ids: [], completed_sessions: 0 }] };
      }
      if (s.startsWith('SELECT earned_question_ids FROM user_quiz_state')) {
        return { rowCount: 1, rows: [{ earned_question_ids: [] }] };
      }
      return { rowCount: 1, rows: [] };
    },
    close: async () => undefined,
  } as unknown as Database;
}

beforeEach(() => {
  out.length = 0;
  delete process.env.QUIZ_FLOW_ID;
});

describe('interactive quiz', () => {
  it('lesson intro has a Start quiz button and the free health checkup reward', async () => {
    await startQuizForContact(fakeDb(null), contact);
    const intro = out.find((m) => m.kind === 'buttons');
    expect(intro?.ids).toEqual(['quiz:start']);
    expect(intro?.body).toMatch(/free health checkup/);
  });

  it('tapping Start sends the question as a menu-style list of A–D', async () => {
    const q = QUESTION_BANK[0];
    await handleQuizText(fakeDb({ question_ids: [q.id, QUESTION_BANK[1].id], current_index: 0 }), contact, 'quiz:start');
    const list = out.find((m) => m.kind === 'list');
    expect(list?.ids).toEqual(['quiz:a', 'quiz:b', 'quiz:c', 'quiz:d']);
    expect(list?.body).toMatch(/Question 1 of 2/);
    expect(list?.body).toContain(q.options[0].text);
  });

  it('a tapped answer gets feedback, then the next question as a list', async () => {
    const q = QUESTION_BANK[0];
    const handled = await answerQuiz(
      fakeDb({ question_ids: [q.id, QUESTION_BANK[1].id], current_index: 0 }),
      contact,
      `quiz:${q.correctOptionId}`,
    );
    expect(handled).toBe(true);
    expect(out[0]).toMatchObject({ kind: 'text' });
    expect(out[0].body).toMatch(/Correct!.*\+10 XP/);
    expect(out[1]).toMatchObject({ kind: 'list' });
    expect(out[1].body).toMatch(/Question 2 of 2/);
  });

  it('typed letters still work, and the last answer mentions the checkup reward', async () => {
    const q = QUESTION_BANK[0];
    const wrong = q.options.find((o) => o.id !== q.correctOptionId)!.id;
    await answerQuiz(fakeDb({ question_ids: [q.id], current_index: 0 }), contact, wrong.toUpperCase());
    expect(out[0].body).toMatch(/Not quite/);
    expect(out[0].body).toMatch(/Session complete/);
    expect(out[0].body).toMatch(/free health checkup/);
  });
});

describe('quiz question layout', () => {
  it('keeps each option on its own line', async () => {
    out.length = 0;
    const q = QUESTION_BANK[0];
    await handleQuizText(fakeDb({ question_ids: [q.id], current_index: 0 }), contact, 'start');
    const body = out.find((m) => m.kind === 'list')!.body;
    for (const letter of ['A', 'B', 'C', 'D']) expect(body).toMatch(new RegExp(`^${letter}\\. `, 'm'));
  });
});
