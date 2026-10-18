import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db.js';
import { runOnboardingDryRun } from '../src/onboarding/scheduler.js';

interface DueRow {
  contact_id: string;
  phone: string;
  quiz_due_at: Date;
}

function createFakeDb(rows: DueRow[]) {
  const query = vi.fn(async (_sql: string) => ({
    rows,
    rowCount: rows.length,
  }));

  const db = {
    query,
    close: vi.fn(),
  } as unknown as Database;

  return { db, query };
}

describe('Onboarding dry-run scheduler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects a simulated student whose quiz is due', async () => {
    const { db, query } = createFakeDb([
      {
        contact_id: 'demo-contact-001',
        phone: '+61400000000',
        quiz_due_at: new Date('2026-10-01T00:00:00Z'),
      },
    ]);

    const log = vi.spyOn(console, 'log')
      .mockImplementation(() => {});

    const count = await runOnboardingDryRun(db);

    expect(count).toBe(1);
    expect(query).toHaveBeenCalledTimes(1);

    const sql = query.mock.calls[0][0];

    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(sql).toContain('o.quiz_due_at <= now()');
    expect(sql).toContain('o.quiz_invite_opted_in_at IS NOT NULL');
    expect(sql).toContain('o.quiz_invite_opted_out_at IS NULL');
    expect(sql).toContain('o.quiz_invite_sent_at IS NULL');

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('1 quiz invitation(s) due')
    );
  });

  it('returns zero when no students are due', async () => {
    const { db, query } = createFakeDb([]);

    const log = vi.spyOn(console, 'log')
      .mockImplementation(() => {});

    const count = await runOnboardingDryRun(db);

    expect(count).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('0 quiz invitation(s) due')
    );
  });
});
