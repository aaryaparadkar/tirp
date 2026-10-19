import type { Database } from '../db.js';
import { catalogueConfig } from '../config.js';
import { sendText } from '../kapso.js';

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const ARRIVAL_REMINDER =
  '👋 OSHC Compass here! Your arrival learning check-in is ready. ' +
  'Reply QUIZ to begin your short healthcare knowledge quiz. ' +
  'Reply ARRIVAL QUIZ OFF to stop these invitations. ' +
  'For policy and coverage details, follow official Medibank sources.';

const scheduledArrivalReminders = new Map<string, NodeJS.Timeout>();

function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date.toISOString().slice(0, 10);
}

function futureYear(month: number, day: number, reference: Date): number {
  const year = reference.getUTCFullYear();
  const candidate = isoDate(year, month, day);
  return candidate && candidate >= reference.toISOString().slice(0, 10) ? year : year + 1;
}

/**
 * Parse arrival dates as humans commonly type them. Numeric dates use
 * day-first interpretation (the Australian default); unambiguous month/day
 * values are still accepted. The returned value is always YYYY-MM-DD.
 */
export function parseArrivalDate(input: string, reference = new Date()): string | null {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[,]/g, ' ')
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return null;

  if (/^today$/.test(value)) return reference.toISOString().slice(0, 10);
  if (/^tomorrow$/.test(value)) {
    const tomorrow = new Date(reference.getTime() + 86_400_000);
    return tomorrow.toISOString().slice(0, 10);
  }
  const relative = /^(?:in\s+)?(\d+)\s+(day|days|week|weeks|month|months)$/.exec(value);
  if (relative) {
    const amount = Number(relative[1]);
    const date = new Date(reference);
    if (/week/.test(relative[2])) date.setUTCDate(date.getUTCDate() + amount * 7);
    else if (/month/.test(relative[2])) date.setUTCMonth(date.getUTCMonth() + amount);
    else date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  const weekday = /^(?:next\s+)?(sun|sunday|mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday)$/.exec(value);
  if (weekday) {
    const weekdays: Record<string, number> = {
      sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
      wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5,
      sat: 6, saturday: 6,
    };
    const target = weekdays[weekday[1]];
    const date = new Date(reference);
    let delta = (target - date.getUTCDay() + 7) % 7;
    if (delta === 0 || value.startsWith('next ')) delta ||= 7;
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  }

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(value);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const yearNumber = Number(numeric[3]);
    const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
    // Australian day-first by default; if only the second value can be a day,
    // interpret the input as month/day instead.
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    return isoDate(year, month, day);
  }

  const monthName = /^(\d{1,2})\s+([a-z]+)(?:\s+(\d{2}|\d{4}))?$/.exec(value)
    || /^([a-z]+)\s+(\d{1,2})(?:\s+(\d{2}|\d{4}))?$/.exec(value);
  if (monthName) {
    const day = Number(monthName[1]) || Number(monthName[2]);
    const monthWord = Number(monthName[1]) ? monthName[2] : monthName[1];
    const month = MONTHS[monthWord];
    if (!month) return null;
    const yearValue = monthName[3] ? Number(monthName[3]) : futureYear(month, day, reference);
    return isoDate(yearValue < 100 ? 2000 + yearValue : yearValue, month, day);
  }

  return null;
}

/**
 * Register an OSHC purchase without creating duplicate
 * onboarding records for the same contact.
 */
export async function registerPurchase(
  db: Database,
  contactId: string,
  purchaseEventKey: string
): Promise<void> {
  if (!purchaseEventKey.trim()) {
    throw new Error('Purchase event key is required');
  }

  await db.query(
    `INSERT INTO onboarding_state (
       contact_id, purchase_event_key
     )
     VALUES ($1, $2)
     ON CONFLICT (contact_id) DO NOTHING`,
    [contactId, purchaseEventKey]
  );
}

/**
 * Save the student's planned arrival date and schedule
 * their first quiz two calendar days after arrival.
 */
export async function saveArrivalDate(
  db: Database,
  contactId: string,
  travelDate: string
): Promise<Date> {
  const normalizedDate = parseArrivalDate(travelDate);
  if (!normalizedDate) throw new Error('Travel date could not be understood');

  // Arrival capture can legitimately precede purchase registration. Create a
  // pending onboarding row instead of turning a valid message into an error.
  await db.query(
    `INSERT INTO onboarding_state (contact_id, purchase_event_key)
     VALUES ($1, $2)
     ON CONFLICT (contact_id) DO NOTHING`,
    [contactId, `manual-arrival-date:${contactId}`],
  );
  const result = await db.query<{ quiz_due_at: Date }>(
    `UPDATE onboarding_state
     SET
       travel_date = $2::date,
       quiz_due_at = (
         ($2::date + INTERVAL '2 days 10 hours')
         AT TIME ZONE 'Australia/Sydney'
       ),
       travel_date_received_at = now(),
       updated_at = now()
     WHERE contact_id = $1
       AND arrival_quiz_started_at IS NULL
     RETURNING quiz_due_at`,
    [contactId, normalizedDate]
  );

  if (!result.rows[0]) {
    throw new Error('No eligible onboarding record found');
  }

  return result.rows[0].quiz_due_at;
}

/**
 * Schedule the demo-friendly arrival reminder after the confirmation message.
 * The delay is opt-in through ONBOARDING_ARRIVAL_REMINDER_DELAY_MS. A database
 * claim makes repeated arrival-date messages and overlapping timers harmless.
 */
export function scheduleArrivalReminder(
  db: Database,
  contactId: string,
  phone: string,
  delayMs = Number(process.env.ONBOARDING_ARRIVAL_REMINDER_DELAY_MS || 0),
): void {
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;

  const existing = scheduledArrivalReminders.get(contactId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    scheduledArrivalReminders.delete(contactId);
    void sendClaimedArrivalReminder(db, contactId, phone).catch((error) => {
      console.error('[onboarding] delayed arrival reminder failed:', error);
    });
  }, delayMs);
  timer.unref();
  scheduledArrivalReminders.set(contactId, timer);
}

async function sendClaimedArrivalReminder(
  db: Database,
  contactId: string,
  phone: string,
): Promise<void> {
  const claim = await db.query<{ contact_id: string }>(
    `UPDATE onboarding_state
        SET quiz_invite_claimed_at = now(),
            quiz_invite_delivery_error = NULL,
            updated_at = now()
      WHERE contact_id = $1
        AND quiz_invite_sent_at IS NULL
        AND quiz_invite_claimed_at IS NULL
        AND arrival_quiz_started_at IS NULL
      RETURNING contact_id`,
    [contactId],
  );
  if (!claim.rows[0]) return;

  try {
    await sendText(catalogueConfig.phoneNumberId, phone, ARRIVAL_REMINDER);
    await db.query(
      `UPDATE onboarding_state
          SET quiz_invite_sent_at = now(),
              quiz_invite_delivery_error = NULL,
              updated_at = now()
        WHERE contact_id = $1`,
      [contactId],
    );
  } catch (error) {
    await db.query(
      `UPDATE onboarding_state
          SET quiz_invite_delivery_error = $2,
              updated_at = now()
        WHERE contact_id = $1`,
      [contactId, error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)],
    ).catch((dbError) => console.error('[onboarding] failed to store delayed reminder error:', dbError));
    throw error;
  }
}
export interface DueArrivalQuiz {
  contactId: string;
  phone: string;
  quizDueAt: Date;
}

export async function listDueArrivalQuizzes(
  db: Database
): Promise<DueArrivalQuiz[]> {
  const result = await db.query<{
    contact_id: string;
    phone: string;
    quiz_due_at: Date;
  }>(
    `SELECT
       o.contact_id,
       c.phone,
       o.quiz_due_at
     FROM onboarding_state o
     JOIN contacts c ON c.id = o.contact_id
     WHERE o.quiz_due_at <= now()
       AND o.arrival_quiz_started_at IS NULL
       AND o.quiz_invite_opted_in_at IS NOT NULL
       AND o.quiz_invite_opted_out_at IS NULL
       AND o.quiz_invite_sent_at IS NULL
     ORDER BY o.quiz_due_at
     LIMIT 50`
  );

  return result.rows.map((row) => ({
    contactId: row.contact_id,
    phone: row.phone,
    quizDueAt: row.quiz_due_at,
  }));
}
/**
 * Record explicit student consent for arrival quiz invitations.
 * Call only after consent has been received and verified.
 */
export async function recordArrivalQuizConsent(
  db: Database,
  contactId: string
): Promise<boolean> {
  const result = await db.query(
    `UPDATE onboarding_state
     SET quiz_invite_opted_in_at = now(),
         quiz_invite_opted_out_at = NULL,
         updated_at = now()
     WHERE contact_id = $1`,
    [contactId]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Withdraw consent for arrival quiz invitations.
 */
export async function withdrawArrivalQuizConsent(
  db: Database,
  contactId: string
): Promise<boolean> {
  const result = await db.query(
    `UPDATE onboarding_state
     SET quiz_invite_opted_out_at = now(),
         updated_at = now()
     WHERE contact_id = $1`,
    [contactId]
  );

  return (result.rowCount ?? 0) > 0;
}
