import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../src/api.js';
import type { Database } from '../src/db.js';
import { resetRateLimitsForTests } from '../src/rate-limit.js';

vi.mock('../src/kapso.js', () => ({
  sendText: vi.fn().mockResolvedValue({ message_id: 'mock-id' }),
  sendFlow: vi.fn().mockResolvedValue({ message_id: 'mock-flow-id' }),
  createKapsoClient: vi.fn(),
}));

interface ContactRow {
  id: string;
  phone: string;
  quiz_opted_in: boolean;
}

/** Minimal in-memory Database stub for the quiz trigger path. */
function makeFakeDb() {
  const contacts = new Map<string, ContactRow>();
  const states = new Map<string, { earned_question_ids: string[]; completed_sessions: number }>();
  const sessions: Array<{ id: string; contact_id: string; question_ids: string[]; current_index: number; status: string }> = [];
  let contactSeq = 0;

  const query = vi.fn(async (text: string, values?: unknown[]) => {
    const vals = (values || []) as any[];
    if (text.includes('FROM contacts WHERE phone')) {
      const row = contacts.get(vals[0] as string);
      return { rowCount: row ? 1 : 0, rows: row ? [{ ...row }] : [] } as any;
    }
    if (text.includes('INSERT INTO contacts')) {
      const row: ContactRow = { id: `c-${++contactSeq}`, phone: vals[1] as string, quiz_opted_in: false };
      contacts.set(row.phone, row);
      return {
        rowCount: 1,
        rows: [{ id: row.id, phone: row.phone, name: 'WhatsApp user', locale: 'en_US', preferred_language: null, opted_in: true }],
      } as any;
    }
    if (text.includes('UPDATE contacts SET quiz_opted_in')) {
      return { rowCount: 1, rows: [] } as any;
    }
    if (text.includes('INSERT INTO user_quiz_state')) {
      const id = vals[0] as string;
      if (!states.has(id)) states.set(id, { earned_question_ids: [], completed_sessions: 0 });
      return { rowCount: 1, rows: [] } as any;
    }
    if (text.includes("FROM quiz_sessions WHERE contact_id = $1 AND status = 'active'")) {
      const found = [...sessions].reverse().find((s) => s.contact_id === vals[0] && s.status === 'active');
      return { rowCount: found ? 1 : 0, rows: found ? [{ id: found.id }] : [] } as any;
    }
    if (text.includes('SELECT topic, question_ids, current_index FROM quiz_sessions WHERE id = $1')) {
      const found = sessions.find((s) => s.id === vals[0]);
      return {
        rowCount: found ? 1 : 0,
        rows: found ? [{ topic: 'finding_healthcare', question_ids: found.question_ids, current_index: found.current_index }] : [],
      } as any;
    }
    if (text.includes('SELECT earned_question_ids, completed_sessions FROM user_quiz_state WHERE contact_id = $1')) {
      const state = states.get(vals[0] as string) || { earned_question_ids: [], completed_sessions: 0 };
      return { rowCount: 1, rows: [{ ...state }] } as any;
    }
    if (text.includes('INSERT INTO quiz_sessions')) {
      if (sessions.some((s) => s.contact_id === vals[1] && s.status === 'active')) {
        throw new Error('duplicate key value violates unique constraint "idx_quiz_sessions_single_active" (SQLSTATE 23505)');
      }
      sessions.push({
        id: vals[0] as string,
        contact_id: vals[1] as string,
        question_ids: JSON.parse(vals[4] as string) as string[],
        current_index: 0,
        status: 'active',
      });
      return { rowCount: 1, rows: [] } as any;
    }
    return { rowCount: 1, rows: [] } as any;
  });
  const db = { query, close: vi.fn() } as unknown as Database;
  return { db, query, sessions };
}

function triggerRequest(phone: unknown, token: string | null, rawBody?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request('http://localhost/quiz/start', {
    method: 'POST',
    headers,
    body: rawBody !== undefined ? rawBody : JSON.stringify({ phone }),
  });
}

describe('POST /quiz/start', () => {
  const TOKEN = 'test-trigger-token';

  beforeEach(() => {
    resetRateLimitsForTests();
    process.env.QUIZ_TRIGGER_TOKEN = TOKEN;
    delete process.env.QUIZ_FLOW_ID;
    vi.clearAllMocks();
  });

  it('rejects missing and invalid tokens', async () => {
    const { db } = makeFakeDb();
    expect((await handleApi(triggerRequest('+61400000001', null), db, '/quiz/start'))!.status).toBe(401);
    expect((await handleApi(triggerRequest('+61400000001', 'wrong'), db, '/quiz/start'))!.status).toBe(401);
  });

  it('returns 503 when the trigger token is not configured', async () => {
    delete process.env.QUIZ_TRIGGER_TOKEN;
    const { db } = makeFakeDb();
    expect((await handleApi(triggerRequest('+61400000001', TOKEN), db, '/quiz/start'))!.status).toBe(503);
  });

  it('rejects malformed JSON and invalid phones', async () => {
    const { db } = makeFakeDb();
    expect((await handleApi(triggerRequest('+61400000001', TOKEN, '{bad json'), db, '/quiz/start'))!.status).toBe(400);
    for (const bad of ['not-a-phone', '123', '', 12345, null]) {
      const res = (await handleApi(triggerRequest(bad, TOKEN), db, '/quiz/start'))!;
      expect(res.status).toBe(422);
    }
  });

  it('starts a new text session for a fresh contact', async () => {
    const { db } = makeFakeDb();
    const res = (await handleApi(triggerRequest('+61400000001', TOKEN), db, '/quiz/start'))!;
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, phone: '+61400000001', resumed: false, delivery: 'text' });
    expect(body.session).toBe(1);
  });

  it('resumes instead of duplicating an active session', async () => {
    const { db, sessions } = makeFakeDb();
    const first = (await handleApi(triggerRequest('+61400000002', TOKEN), db, '/quiz/start'))!;
    expect(first.status).toBe(200);
    const second = (await handleApi(triggerRequest('+61400000002', TOKEN), db, '/quiz/start'))!;
    const body = (await second.json()) as Record<string, unknown>;
    expect(second.status).toBe(200);
    expect(body.resumed).toBe(true);
    expect(sessions.filter((s) => s.status === 'active')).toHaveLength(1);
  });

  it('delivers via Flow when QUIZ_FLOW_ID is configured', async () => {
    process.env.QUIZ_FLOW_ID = 'flow-123';
    const kapso = await import('../src/kapso.js');
    const { db } = makeFakeDb();
    const res = (await handleApi(triggerRequest('+61400000003', TOKEN), db, '/quiz/start'))!;
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body.delivery).toBe('flow');
    expect(kapso.sendFlow).toHaveBeenCalled();
  });

  it('rate-limits repeated triggers for the same phone', async () => {
    const { db } = makeFakeDb();
    for (let i = 0; i < 5; i++) {
      const res = (await handleApi(triggerRequest('+61400000004', TOKEN), db, '/quiz/start'))!;
      expect([200, 429]).toContain(res.status);
    }
    const limited = (await handleApi(triggerRequest('+61400000004', TOKEN), db, '/quiz/start'))!;
    expect(limited.status).toBe(429);
  });
});
