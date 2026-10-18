import type { Database } from '../db.js';
import { id, now } from '../lib.js';
import { QUESTION_BANK } from './question-bank.js';
import type { QuizQuestion } from './types.js';
import { catalogueConfig } from '../config.js';
import { sendText } from '../kapso.js';
import {
  getSessionConfig,
  TOTAL_CURRICULUM_QUESTIONS,
  TOTAL_CURRICULUM_XP,
  TOTAL_CURRICULUM_SESSIONS,
} from './curriculum.js';
import { canonicalFlowSessionNumber, resolvedQuizFlowId } from './flow-definition.js';

/** Warn at most once that a Flow-configured environment is on a text session. */
let warnedFlowScope = false;

type PlayerState = { earned_question_ids: string[]; completed_sessions: number };

export type QuizDelivery = 'flow' | 'text' | 'completed';

export interface QuizStartResult {
  sessionId: string | null;
  sessionNumber: number | null;
  topic?: string;
  title?: string;
  delivery: QuizDelivery;
  resumed: boolean;
}

async function send(to: string, body: string): Promise<void> {
  const { formatWhatsAppAnswer } = await import('../response-format.js');
  await sendText(catalogueConfig.phoneNumberId, to, formatWhatsAppAnswer(body));
}

function questionMessage(question: QuizQuestion, index: number, total: number): string {
  const options = question.options.map((option) => `${option.id.toUpperCase()}. ${option.text}`).join('\n');
  return `*Question ${index + 1} of ${total}*\n${question.question}\n\n${options}\n\nReply with A, B, C, or D.`;
}

type ActiveSessionRow = { id: string; question_ids: string[]; current_index: number };

async function getActiveSession(db: Database, contactId: string): Promise<ActiveSessionRow | null> {
  const active = await db.query<{ id: string }>(
    "SELECT id FROM quiz_sessions WHERE contact_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [contactId]
  );
  if (!active.rows[0]) return null;
  const session = await db.query<{ topic: string; question_ids: string[]; current_index: number }>(
    'SELECT topic, question_ids, current_index FROM quiz_sessions WHERE id = $1',
    [active.rows[0].id]
  );
  if (!session.rows[0]) return null;
  return { id: active.rows[0].id, question_ids: session.rows[0].question_ids || [], current_index: session.rows[0].current_index };
}

async function resendCurrentQuestion(db: Database, contact: { id: string; phone: string }): Promise<ActiveSessionRow | null> {
  const session = await getActiveSession(db, contact.id);
  if (!session) return null;
  const questions = session.question_ids
    .map((questionId) => QUESTION_BANK.find((question) => question.id === questionId))
    .filter((q): q is QuizQuestion => Boolean(q));
  const current = questions[session.current_index];
  if (current) {
    await send(contact.phone, questionMessage(current, session.current_index, questions.length));
  } else {
    await send(contact.phone, 'You already have a quiz in progress. Reply A, B, C, or D to answer, or YES to repeat the current question.');
  }
  return session;
}

export async function handleQuizText(db: Database, contact: { id: string; phone: string }, text: string): Promise<boolean> {
  const command = text.trim().toLowerCase();
  const stopKeywords = ['stop', 'stop quiz', 'cancel', 'cancel quiz', 'quit', 'exit', 'stop reminders'];

  if (stopKeywords.includes(command)) {
    await db.query("DELETE FROM quiz_sessions WHERE contact_id = $1 AND status = 'active'", [contact.id]);
    await db.query('UPDATE contacts SET quiz_opted_in = false WHERE id = $1', [contact.id]);
    await send(contact.phone, 'The quiz has been stopped. Your earned XP is safely saved! Reply MENU to browse services, or QUIZ whenever you want to resume.');
    return true;
  }

  if (!['quiz', 'start quiz', 'start', 'yes'].includes(command)) return false;

  if (command === 'quiz' || command === 'start quiz') {
    await db.query('UPDATE contacts SET quiz_opted_in = true WHERE id = $1', [contact.id]);
    await db.query('INSERT INTO user_quiz_state (contact_id) VALUES ($1) ON CONFLICT (contact_id) DO NOTHING', [contact.id]);
  }

  const active = await db.query<{ id: string }>(
    "SELECT id FROM quiz_sessions WHERE contact_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [contact.id]
  );

  if (active.rows[0]) {
    const session = await db.query<{ topic: string; question_ids: string[]; current_index: number }>(
      'SELECT topic, question_ids, current_index FROM quiz_sessions WHERE id = $1',
      [active.rows[0].id]
    );
    if (command === 'yes' || command === 'start' || command === 'quiz' || command === 'start quiz') {
      const qIds = session.rows[0]?.question_ids || [];
      const questions = qIds
        .map((questionId) => QUESTION_BANK.find((question) => question.id === questionId))
        .filter((q): q is QuizQuestion => Boolean(q));
      const curIdx = session.rows[0].current_index;
      if (questions[curIdx]) {
        await send(contact.phone, questionMessage(questions[curIdx], curIdx, questions.length));
      }
    } else {
      await send(contact.phone, 'You already have a quiz in progress. Reply A, B, C, or D to answer, or YES to repeat the current question.');
    }
    return true;
  }

  // Bare START / YES only resume an active session (handled above). Without an
  // active session they belong to the normal greeting flow, so do not hijack them.
  if (command !== 'quiz' && command !== 'start quiz') return false;
  await startSession(db, contact);
  return true;
}

/**
 * Shared quiz entrypoint used by both the WhatsApp QUIZ command and the
 * authenticated HTTP trigger. Idempotent: an existing active session is
 * resumed instead of duplicated. Concurrent triggers are serialized by a
 * partial unique index (one active session per contact); the loser of a
 * simultaneous insert resumes the winner's session.
 */
export async function startQuizForContact(
  db: Database,
  contact: { id: string; phone: string }
): Promise<QuizStartResult> {
  await db.query('UPDATE contacts SET quiz_opted_in = true WHERE id = $1', [contact.id]).catch(() => undefined);
  await db.query('INSERT INTO user_quiz_state (contact_id) VALUES ($1) ON CONFLICT (contact_id) DO NOTHING', [contact.id]);
  const resumed = await resendCurrentQuestion(db, contact);
  if (resumed) {
    return { sessionId: resumed.id, sessionNumber: null, delivery: 'text', resumed: true };
  }

  const stateResult = await db.query<PlayerState>(
    'SELECT earned_question_ids, completed_sessions FROM user_quiz_state WHERE contact_id = $1',
    [contact.id]
  );
  const state = stateResult.rows[0] || { earned_question_ids: [], completed_sessions: 0 };
  const sessionConfig = getSessionConfig(state.completed_sessions);

  // Check if all sessions in curriculum are completed
  if (!sessionConfig) {
    const totalMastered = state.earned_question_ids.length;
    const totalXp = state.earned_question_ids.reduce(
      (sum, qid) => sum + (QUESTION_BANK.find((q) => q.id === qid)?.xp || 0),
      0
    );
    await send(
      contact.phone,
      `You’ve completed all ${TOTAL_CURRICULUM_QUESTIONS} questions and earned ${totalXp}/${TOTAL_CURRICULUM_XP} XP. Congratulations! You are eligible for a free health checkup.`
    );
    return { sessionId: null, sessionNumber: null, delivery: 'completed', resumed: false };
  }

  const sessionId = id();
  try {
    await db.query(
      "INSERT INTO quiz_sessions (id, contact_id, topic, difficulty, question_ids, status) VALUES ($1, $2, $3, $4, $5, 'active')",
      [sessionId, contact.id, sessionConfig.topic, 1, JSON.stringify(sessionConfig.questionIds)]
    );
  } catch (error) {
    // Lost a simultaneous insert race (partial unique index on active
    // sessions): resume the winner instead of duplicating.
    if (error instanceof Error && /duplicate|unique|23505/i.test(error.message)) {
      const winner = await resendCurrentQuestion(db, contact);
      if (winner) return { sessionId: winner.id, sessionNumber: null, delivery: 'text', resumed: true };
    }
    throw error;
  }

  // Deliver the interactive Flow only when a real Flow ID is configured AND the
  // published JSON encodes this session. The canonical Flow carries one fixed
  // five-question session; later sessions fall back to text.
  const quizFlowId = resolvedQuizFlowId();
  const flowEncodesThisSession = sessionConfig.sessionNumber === canonicalFlowSessionNumber();
  if (quizFlowId && flowEncodesThisSession) {
    const { sendFlow } = await import('../kapso.js');
    try {
      await sendFlow({
        phoneNumberId: catalogueConfig.phoneNumberId,
        to: contact.phone,
        flowId: quizFlowId,
        bodyText: `📚 Learning Session ${sessionConfig.sessionNumber} of ${TOTAL_CURRICULUM_SESSIONS}: ${sessionConfig.title}\n\n${sessionConfig.lesson}\n\nTap below to take your 5-question quiz!`,
        flowCta: 'Start Quiz',
        screen: 'LESSON',
        data: {
          session_id: sessionId,
          topic_title: sessionConfig.title,
          lesson_text: sessionConfig.lesson,
        },
        flowToken: `oshc_quiz_flow:${sessionId}:${contact.id}`,
      });
    } catch (error) {
      // Roll back the placeholder session so a retry starts cleanly instead of
      // resuming a Flow-less text session on the next trigger.
      await db.query('DELETE FROM quiz_sessions WHERE id = $1', [sessionId]).catch(() => undefined);
      throw error;
    }
    return { sessionId, sessionNumber: sessionConfig.sessionNumber, topic: sessionConfig.topic, title: sessionConfig.title, delivery: 'flow', resumed: false };
  }

  if (quizFlowId && !flowEncodesThisSession && !warnedFlowScope) {
    warnedFlowScope = true;
    console.warn(
      `[quiz] QUIZ_FLOW_ID is set but the published Flow encodes session ${canonicalFlowSessionNumber()} only; session ${sessionConfig.sessionNumber} is delivered as text.`,
    );
  }

  // Fallback to chat-based informative session + interactive questions
  const masteredCount = state.earned_question_ids.length;
  const currentTotalXp = state.earned_question_ids.reduce(
    (sum, qid) => sum + (QUESTION_BANK.find((q) => q.id === qid)?.xp || 0),
    0
  );

  await send(
    contact.phone,
    `📚 Learning Session ${sessionConfig.sessionNumber} of ${TOTAL_CURRICULUM_SESSIONS}: ${sessionConfig.title}\n\n${sessionConfig.lesson}\n\nProgress: ${masteredCount}/${TOTAL_CURRICULUM_QUESTIONS} questions mastered (${currentTotalXp}/${TOTAL_CURRICULUM_XP} XP).\n\nReply START when you’re ready for the questions.`
  );
  return { sessionId, sessionNumber: sessionConfig.sessionNumber, topic: sessionConfig.topic, title: sessionConfig.title, delivery: 'text', resumed: false };
}

export async function startSession(db: Database, contact: { id: string; phone: string }): Promise<void> {
  await startQuizForContact(db, contact);
}

export async function answerQuiz(db: Database, contact: { id: string; phone: string }, text: string): Promise<boolean> {
  const current = await db.query<{ id: string; question_ids: string[]; current_index: number; earned_xp: number }>(
    "SELECT id, question_ids, current_index, earned_xp FROM quiz_sessions WHERE contact_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [contact.id]
  );
  if (!current.rows[0]) return false;
  const session = current.rows[0];
  const question = QUESTION_BANK.find((item) => item.id === session.question_ids[session.current_index]);
  if (!question) return false;
  const answer = text.trim().toLowerCase().replace(/[.)]$/, '');
  if (/^(hi|hello|hey|menu|catalogue|services?|support)$/i.test(answer)) return false;

  const option = question.options.find((item) => item.id === answer || String(question.options.indexOf(item) + 1) === answer);
  if (!option) {
    await send(contact.phone, 'Please answer with A, B, C, or D (or reply STOP to exit the quiz).');
    return true;
  }

  let earned = session.earned_xp;
  let feedback: string;
  if (option.id === question.correctOptionId) {
    const before = await db.query<{ earned_question_ids: string[] }>(
      'SELECT earned_question_ids FROM user_quiz_state WHERE contact_id = $1',
      [contact.id]
    );
    const firstCorrect = !before.rows[0]?.earned_question_ids.includes(question.id);
    await db.query(
      "UPDATE user_quiz_state SET earned_question_ids = CASE WHEN earned_question_ids ? $2 THEN earned_question_ids ELSE earned_question_ids || to_jsonb($2::text) END, updated_at = $3 WHERE contact_id = $1",
      [contact.id, question.id, now()]
    );
    if (firstCorrect) earned += question.xp;
    feedback = `Correct! ${firstCorrect ? `+${question.xp} XP. ` : 'You already earned XP for this question. '}${question.explanation}`;
  } else {
    feedback = `Not quite. (Correct was ${question.correctOptionId.toUpperCase()})\n${question.explanation}`;
  }

  const nextIndex = session.current_index + 1;
  if (nextIndex < session.question_ids.length) {
    await db.query('UPDATE quiz_sessions SET current_index = $2, earned_xp = $3 WHERE id = $1', [session.id, nextIndex, earned]);
    const nextQ = QUESTION_BANK.find((item) => item.id === session.question_ids[nextIndex])!;
    await send(contact.phone, `${feedback}\n\n${questionMessage(nextQ, nextIndex, session.question_ids.length)}`);
  } else {
    await db.query(
      "UPDATE quiz_sessions SET current_index = $2, earned_xp = $3, status = 'completed', completed_at = $4 WHERE id = $1",
      [session.id, nextIndex, earned, now()]
    );
    await db.query(
      "UPDATE user_quiz_state SET completed_sessions = completed_sessions + 1, next_reminder_at = now() + interval '7 days', updated_at = now() WHERE contact_id = $1",
      [contact.id]
    );
    const state = await db.query<PlayerState>(
      'SELECT earned_question_ids, completed_sessions FROM user_quiz_state WHERE contact_id = $1',
      [contact.id]
    );
    const mastered = state.rows[0].earned_question_ids.length;
    const totalXp = state.rows[0].earned_question_ids.reduce(
      (sum, id) => sum + (QUESTION_BANK.find((q) => q.id === id)?.xp || 0),
      0
    );
    const eligible = mastered >= TOTAL_CURRICULUM_QUESTIONS;
    await send(
      contact.phone,
      `${feedback}\n\n🎉 Session complete! You earned ${earned} XP this session.\nTotal Progress: ${totalXp}/${TOTAL_CURRICULUM_XP} XP (${mastered}/${TOTAL_CURRICULUM_QUESTIONS} questions mastered).${eligible ? '\n\n🏆 Congratulations! You have mastered all questions and are eligible for a free health checkup.' : '\n\nYou can reply QUIZ at any time to take your next learning session.'}`
    );
  }
  return true;
}

export async function sendWeeklyQuizReminders(db: Database): Promise<number> {
  if (!process.env.QUIZ_REMINDER_TEMPLATE) return 0;
  const due = await db.query<{ id: string; phone: string }>(
    "SELECT c.id, c.phone FROM contacts c JOIN user_quiz_state s ON s.contact_id = c.id WHERE c.quiz_opted_in = true AND s.next_reminder_at <= now() ORDER BY s.next_reminder_at LIMIT 100"
  );
  let sent = 0;
  for (const contact of due.rows) {
    const client = (await import('../kapso.js')).createKapsoClient();
    await client.messages.sendTemplate({
      phoneNumberId: catalogueConfig.phoneNumberId,
      to: contact.phone.replace(/^\+/, ''),
      template: {
        name: process.env.QUIZ_REMINDER_TEMPLATE,
        language: { code: process.env.QUIZ_REMINDER_TEMPLATE_LANGUAGE || 'en' },
      },
    });
    await db.query(
      "UPDATE user_quiz_state SET last_reminded_at = now(), next_reminder_at = now() + interval '7 days', updated_at = now() WHERE contact_id = $1",
      [contact.id]
    );
    sent++;
  }
  return sent;
}
