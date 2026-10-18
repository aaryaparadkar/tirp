import type { Database } from '../db.js';
import { catalogueConfig } from '../config.js';
import { sendText } from '../kapso.js';
import { listDueArrivalQuizzes } from './service.js';

/** Read-only mode. Never sends or alters onboarding records. */
export async function runOnboardingDryRun(db: Database): Promise<number> {
  const dueStudents = await listDueArrivalQuizzes(db);
  console.log(
    `[onboarding] DRY RUN: ${dueStudents.length} ` +
    `quiz invitation(s) due. No messages sent.`,
  );
  return dueStudents.length;
}

/**
 * SANDBOX DEMO ONLY. Send one real text invitation, but ONLY if:
 * - an explicitly chosen contact has a due invitation and opted in;
 * - the contact has messaged the bot within the previous 23 hours;
 * - no invite has been sent or claimed.
 *
 * The atomic claim prevents overlapping worker runs from sending duplicates.
 * In the event of an uncertain send failure, the claim stays in place for
 * manual review instead of automatically retrying an unwanted duplicate.
 *
 * Do not use as production delayed-delivery logic. Outside WhatsApp's
 * 24-hour service window, an approved template is generally required.
 */
export async function runOnboardingDemoSend(db: Database): Promise<number> {
  if (process.env.ONBOARDING_DEMO_SEND !== 'true') return 0;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ONBOARDING_DEMO_SEND cannot be enabled in production');
  }

  const contactId = process.env.ONBOARDING_DEMO_CONTACT_ID?.trim();
  const phoneNumberId = catalogueConfig.phoneNumberId;
  if (!contactId || !phoneNumberId) {
    throw new Error('ONBOARDING_DEMO_CONTACT_ID and KAPSO_PHONE_NUMBER_ID are required');
  }

  const claimed = await db.query<{
    contact_id: string;
    phone: string;
  }>(
    `WITH due AS (
       SELECT o.contact_id
       FROM onboarding_state AS o
       WHERE o.contact_id = $1
         AND o.quiz_due_at <= now()
         AND o.arrival_quiz_started_at IS NULL
         AND o.quiz_invite_opted_in_at IS NOT NULL
         AND o.quiz_invite_opted_out_at IS NULL
         AND o.quiz_invite_sent_at IS NULL
         AND o.quiz_invite_claimed_at IS NULL
         AND EXISTS (
           SELECT 1 FROM conversation_messages AS m
           WHERE m.contact_id = o.contact_id
             AND m.direction = 'inbound'
             AND m.created_at >= now() - INTERVAL '23 hours'
         )
       ORDER BY o.quiz_due_at
       LIMIT 1
       FOR UPDATE OF o SKIP LOCKED
     )
     UPDATE onboarding_state AS o
     SET quiz_invite_claimed_at = now(),
         quiz_invite_delivery_error = NULL,
         updated_at = now()
     FROM due, contacts AS c
     WHERE o.contact_id = due.contact_id
       AND c.id = o.contact_id
     RETURNING o.contact_id, c.phone`,
    [contactId],
  );

  const student = claimed.rows[0];
  if (!student) {
    console.log('[onboarding] DEMO: No eligible, unclaimed sandbox invitation (check due date, opt-in and recent inbound message).');
    return 0;
  }

  const reminder =
    '👋 OSHC Compass here! Your arrival learning check-in is ready. ' +
    'Reply QUIZ to begin your short healthcare knowledge quiz. ' +
    'Reply ARRIVAL QUIZ OFF to stop these invitations. ' +
    'For policy and coverage details, follow official Medibank sources.';

  try {
    await sendText(phoneNumberId, student.phone, reminder);
    await db.query(
      `UPDATE onboarding_state
       SET quiz_invite_sent_at = now(),
           quiz_invite_delivery_error = NULL,
           updated_at = now()
       WHERE contact_id = $1`,
      [student.contact_id],
    );
    console.log('[onboarding] DEMO: Reminder accepted by Kapso for the designated sandbox contact.');
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.query(
      `UPDATE onboarding_state
       SET quiz_invite_delivery_error = $2,
           updated_at = now()
       WHERE contact_id = $1`,
      [student.contact_id, message.slice(0, 500)],
    ).catch((dbError) => console.error('[onboarding] Failed to store delivery error', dbError));
    console.error('[onboarding] DEMO: Send failed. Claim retained to prevent automatic duplicate retry.', error);
    return 0;
  }
}
