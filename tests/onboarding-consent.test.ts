import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db.js';
import {
  recordArrivalQuizConsent,
  withdrawArrivalQuizConsent,
} from '../src/onboarding/service.js';

function mockDatabase() {
  const query = vi.fn(async (
    _sql: string,
    _params?: unknown[]
  ) => ({
    rows: [],
    rowCount: 1,
  }));

  return {
    db: { query } as unknown as Database,
    query,
  };
}

describe('Arrival quiz consent', () => {
  it('records explicit opt-in', async () => {
    const { db, query } = mockDatabase();

    const updated = await recordArrivalQuizConsent(
      db,
      'demo-contact'
    );

    expect(updated).toBe(true);
    expect(query.mock.calls[0][0])
      .toContain('quiz_invite_opted_in_at = now()');
    expect(query.mock.calls[0][0])
      .toContain('quiz_invite_opted_out_at = NULL');
    expect(query.mock.calls[0][1])
      .toEqual(['demo-contact']);
  });

  it('records opt-out', async () => {
    const { db, query } = mockDatabase();

    const updated = await withdrawArrivalQuizConsent(
      db,
      'demo-contact'
    );

    expect(updated).toBe(true);
    expect(query.mock.calls[0][0])
      .toContain('quiz_invite_opted_out_at = now()');
    expect(query.mock.calls[0][1])
      .toEqual(['demo-contact']);
  });
});
