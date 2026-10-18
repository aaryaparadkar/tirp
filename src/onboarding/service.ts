import type { Database } from '../db.js';

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
  const parsed = new Date(`${travelDate}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(travelDate) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== travelDate
  ) {
    throw new Error('Travel date must be YYYY-MM-DD');
  }

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
    [contactId, travelDate]
  );

  if (!result.rows[0]) {
    throw new Error('No eligible onboarding record found');
  }

  return result.rows[0].quiz_due_at;
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