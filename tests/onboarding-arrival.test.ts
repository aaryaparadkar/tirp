import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db.js';
import { parseArrivalDate, saveArrivalDate } from '../src/onboarding/service.js';

const REFERENCE = new Date('2026-10-18T00:00:00Z');

describe('arrival date parsing', () => {
  it.each([
    ['2026-10-16', '2026-10-16'],
    ['16/10/2026', '2026-10-16'],
    ['16-10-2026', '2026-10-16'],
    ['16 October 2026', '2026-10-16'],
    ['October 16, 2026', '2026-10-16'],
    ['16th Oct 2026', '2026-10-16'],
    ['16 December', '2026-12-16'],
    ['tomorrow', '2026-10-19'],
    ['in 2 weeks', '2026-11-01'],
    ['next Friday', '2026-10-23'],
  ])('accepts %s', (input, expected) => {
    expect(parseArrivalDate(input, REFERENCE)).toBe(expected);
  });

  it('rejects impossible dates instead of silently rolling them over', () => {
    expect(parseArrivalDate('31 February 2026', REFERENCE)).toBeNull();
    expect(parseArrivalDate('not a date', REFERENCE)).toBeNull();
  });
});

describe('saveArrivalDate', () => {
  it('creates a pending onboarding row when purchase registration is absent', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ quiz_due_at: new Date('2026-10-20T01:00:00Z') }] });
    const db = { query, close: vi.fn() } as unknown as Database;

    await saveArrivalDate(db, 'contact-1', '16 October 2026');

    expect(query.mock.calls[0][0]).toContain('INSERT INTO onboarding_state');
    expect(query.mock.calls[0][1]).toEqual(['contact-1', 'manual-arrival-date:contact-1']);
    expect(query.mock.calls[1][1]).toEqual(['contact-1', '2026-10-16']);
  });
});
