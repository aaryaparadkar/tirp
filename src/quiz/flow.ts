import type { Database } from "../db.js";
import {
  WhatsAppFlow,
  type FlowContext,
  type FlowDefinition,
} from "../flows.js";
import type { FlowResponse } from "../types.js";
import { id, now } from "../lib.js";
import { QUESTION_BANK } from "./question-bank.js";
import {
  TOTAL_CURRICULUM_QUESTIONS,
  TOTAL_CURRICULUM_XP,
  getSessionConfig,
} from "./curriculum.js";
import { catalogueConfig } from "../config.js";
import { sendText } from "../kapso.js";
import { loadCanonicalQuizFlow } from "./flow-definition.js";

/**
 * Runtime handler for the published OSHC quiz Flow.
 *
 * The Flow screens are NOT generated here. The single source of truth is
 * `flows/oshc_quiz_flow.json` (see `flow-definition.ts`), which operators
 * import into Kapso. This class only reacts to submissions: it reads `q_one..q_five`,
 * grades them against the question bank, updates XP/session state, and sends
 * the completion summary.
 */
export class OshcQuizFlow extends WhatsAppFlow {
  readonly name = "oshc_quiz_flow";

  constructor(private readonly db: Database) {
    super();
  }

  /** The published Flow JSON, loaded from the canonical file. */
  definition(): FlowDefinition {
    return loadCanonicalQuizFlow();
  }

  async handle(response: FlowResponse, context: FlowContext): Promise<void> {
    const contactId = context.contactId;
    if (!contactId) return;

    // Record submission into flow_submissions
    await this.db.query(
      "INSERT INTO flow_submissions (id, flow_name, flow_token, phone, response_json, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        id(),
        this.name,
        response.flowToken || context.flowToken || null,
        context.phone,
        JSON.stringify(response),
        now(),
      ],
    );

    // Find active quiz session for this contact
    let session = (
      await this.db.query<{
        id: string;
        question_ids: string[];
        earned_xp: number;
      }>(
        "SELECT id, question_ids, earned_xp FROM quiz_sessions WHERE contact_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
        [contactId],
      )
    ).rows[0];

    // If no active session found, resolve from completed_sessions
    if (!session) {
      const stateRes = await this.db.query<{ completed_sessions: number }>(
        "SELECT completed_sessions FROM user_quiz_state WHERE contact_id = $1",
        [contactId],
      );
      const completedSessions = stateRes.rows[0]?.completed_sessions || 0;
      const config = getSessionConfig(completedSessions);
      if (!config) {
        await sendText(
          catalogueConfig.phoneNumberId,
          context.phone,
          `You have completed all ${TOTAL_CURRICULUM_QUESTIONS} questions and earned all ${TOTAL_CURRICULUM_XP} XP. Congratulations! You are eligible for a free health checkup.`,
        );
        return;
      }
      const sessionId = id();
      await this.db.query(
        "INSERT INTO quiz_sessions (id, contact_id, topic, difficulty, question_ids, status) VALUES ($1, $2, $3, 1, $4, 'active')",
        [
          sessionId,
          contactId,
          config.topic,
          JSON.stringify(config.questionIds),
        ],
      );
      session = {
        id: sessionId,
        question_ids: config.questionIds,
        earned_xp: 0,
      };
    }

    const questionIds = session.question_ids;
    const questions = questionIds
      .map((qid) => QUESTION_BANK.find((q) => q.id === qid))
      .filter((q): q is (typeof QUESTION_BANK)[number] => Boolean(q));

    // Grade submitted answers
    let correctCount = 0;
    let earnedXp = 0;
    const breakdownLines: string[] = [];
    const newCorrectIds: string[] = [];

    const existingEarned =
      (
        await this.db.query<{ earned_question_ids: string[] }>(
          "SELECT earned_question_ids FROM user_quiz_state WHERE contact_id = $1",
          [contactId],
        )
      ).rows[0]?.earned_question_ids || [];

    questions.forEach((q, index) => {
      const questionName = [
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
      ][index];
      if (!questionName)
        throw new Error(
          "Quiz submission contains more questions than the canonical Flow supports.",
        );
      const fieldKey = `q_${questionName}`;
      const rawAnswer = String(
        response[fieldKey] ||
          (response.data as Record<string, unknown>)?.[fieldKey] ||
          "",
      )
        .trim()
        .toLowerCase()
        .replace(/^option_/, "");
      const isCorrect = rawAnswer === q.correctOptionId.toLowerCase();

      if (isCorrect) {
        correctCount++;
        const firstTime =
          !existingEarned.includes(q.id) && !newCorrectIds.includes(q.id);
        if (firstTime) {
          earnedXp += q.xp;
          newCorrectIds.push(q.id);
        }
        breakdownLines.push(
          `Q${index + 1}: Correct! ${firstTime ? `(+${q.xp} XP)` : ""}\n${q.explanation}\n🔗 Source: ${q.source.title} (${q.source.url})`,
        );
      } else {
        breakdownLines.push(
          `Q${index + 1}: Not quite. (Correct answer was ${q.correctOptionId.toUpperCase()})\n${q.explanation}\n🔗 Source: ${q.source.title} (${q.source.url})`,
        );
      }
    });

    // Update user_quiz_state in database
    for (const qid of newCorrectIds) {
      await this.db.query(
        "UPDATE user_quiz_state SET earned_question_ids = earned_question_ids || to_jsonb($2::text), updated_at = $3 WHERE contact_id = $1",
        [contactId, qid, now()],
      );
    }
    await this.db.query(
      "UPDATE user_quiz_state SET completed_sessions = completed_sessions + 1, next_reminder_at = now() + interval '7 days', updated_at = now() WHERE contact_id = $1",
      [contactId],
    );

    // Update session status to completed
    await this.db.query(
      "UPDATE quiz_sessions SET current_index = $2, earned_xp = $3, status = 'completed', completed_at = $4 WHERE id = $1",
      [session.id, questionIds.length, earnedXp, now()],
    );

    // Calculate total progress
    const updatedState = (
      await this.db.query<{
        earned_question_ids: string[];
        completed_sessions: number;
      }>(
        "SELECT earned_question_ids, completed_sessions FROM user_quiz_state WHERE contact_id = $1",
        [contactId],
      )
    ).rows[0];

    const totalMastered = updatedState?.earned_question_ids?.length || 0;
    const totalXp = (updatedState?.earned_question_ids || []).reduce(
      (sum, qid) => {
        const match = QUESTION_BANK.find((q) => q.id === qid);
        return sum + (match?.xp || 0);
      },
      0,
    );
    const eligible = totalMastered >= TOTAL_CURRICULUM_QUESTIONS;

    const summaryText = [
      `🎉 Quiz Session Complete!`,
      ``,
      `Score: ${correctCount}/${questions.length} correct`,
      `XP Earned this session: +${earnedXp} XP`,
      `Total Progress: ${totalXp}/${TOTAL_CURRICULUM_XP} XP (${totalMastered}/${TOTAL_CURRICULUM_QUESTIONS} questions mastered)`,
      ...(eligible
        ? [
            `\n🏆 Congratulations! You have mastered all questions and qualify for your free health checkup!`,
          ]
        : []),
      ``,
      `Detailed Breakdown:`,
      breakdownLines.join("\n\n"),
      ``,
      `You can reply QUIZ at any time to take your next learning session.`,
    ].join("\n");

    await sendText(catalogueConfig.phoneNumberId, context.phone, summaryText);
  }
}
