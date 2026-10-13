import type { Database } from '../db.js';
import { WhatsAppFlow, type FlowContext, type FlowDefinition } from '../flows.js';
import type { FlowResponse } from '../types.js';
import { id, now } from '../lib.js';
import { QUESTION_BANK } from './question-bank.js';
import { QUIZ_CURRICULUM, TOTAL_CURRICULUM_QUESTIONS, TOTAL_CURRICULUM_XP, getSessionConfig, getSessionQuestions } from './curriculum.js';
import { catalogueConfig } from '../config.js';
import { sendText } from '../kapso.js';

export class OshcQuizFlow extends WhatsAppFlow {
  readonly name = 'oshc_quiz_flow';

  constructor(private readonly db: Database) {
    super();
  }

  /**
   * Generates a multi-screen Flow JSON definition (Meta Flow version 7.3):
   * Screen 1: LESSON (Interactive, fun educational briefing)
   * Screen 2..N+1: QUESTION_1..QUESTION_N (Each question on its own dedicated screen)
   * Screen N+2: RESULTS (Answers review, explanations, XP rewards, assist links, and claim action)
   */
  definition(sessionIndex = 0): FlowDefinition {
    const session = QUIZ_CURRICULUM[sessionIndex] || QUIZ_CURRICULUM[0];
    const questions = getSessionQuestions(session);
    const totalQuestions = questions.length;

    // 1. Build routing model: LESSON -> QUESTION_1 -> ... -> QUESTION_N -> RESULTS
    const routing_model: Record<string, string[]> = {
      LESSON: ['QUESTION_1'],
    };

    questions.forEach((_, index) => {
      const current = `QUESTION_${index + 1}`;
      const next = index < totalQuestions - 1 ? `QUESTION_${index + 2}` : 'RESULTS';
      routing_model[current] = [next];
    });
    routing_model['RESULTS'] = [];

    // 2. Screen 1: Informative Session
    const lessonScreen = {
      id: 'LESSON',
      title: 'OSHC Masterclass',
      terminal: false,
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: 'OSHC Masterclass 🇦🇺' },
          { type: 'TextSubheading', text: session.title },
          { type: 'TextBody', markdown: true, text: session.lesson },
          {
            type: 'Footer',
            label: 'Start Quiz ➔',
            'on-click-action': {
              name: 'navigate',
              next: { type: 'screen', name: 'QUESTION_1' },
            },
          },
        ],
      },
    };

    // 3. Question Screens (one per question)
    const questionScreens = questions.map((q, index) => {
      const screenId = `QUESTION_${index + 1}`;
      const nextScreenId = index < totalQuestions - 1 ? `QUESTION_${index + 2}` : 'RESULTS';
      const isLast = index === totalQuestions - 1;

      return {
        id: screenId,
        title: `Question ${index + 1} of ${totalQuestions}`,
        terminal: false,
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: `Question ${index + 1} of ${totalQuestions}` },
            { type: 'TextSubheading', text: `Level ${session.sessionNumber} • Earn +${q.xp} XP ⭐` },
            { type: 'TextBody', text: q.question },
            {
              type: 'RadioButtonsGroup',
              name: `q${index + 1}`,
              label: 'Select your answer:',
              required: true,
              'data-source': q.options.map((opt) => ({
                id: opt.id,
                title: `Option ${opt.id.toUpperCase()}`,
                description: opt.text,
              })),
            },
            {
              type: 'Footer',
              label: isLast ? 'Review & Results ➔' : 'Next Question ➔',
              'on-click-action': {
                name: 'navigate',
                next: { type: 'screen', name: nextScreenId },
              },
            },
          ],
        },
      };
    });

    // 4. Final Review & Results Screen
    const resultsChildren: Array<Record<string, unknown>> = [
      { type: 'TextHeading', text: '🎉 Session Review & Answers' },
      { type: 'TextSubheading', text: 'Review key answers, explanations & resources:' },
    ];

    // Add answer & explanation card for each question
    questions.forEach((q, index) => {
      const correctOpt = q.options.find((o) => o.id === q.correctOptionId);
      resultsChildren.push(
        {
          type: 'TextSubheading',
          text: `Question ${index + 1} (+${q.xp} XP)`,
        },
        {
          type: 'TextBody',
          markdown: true,
          text: `\`'*Your Selection:* Option ' + \${screen.QUESTION_${index + 1}.form.q${index + 1}}\``,
        },
        {
          type: 'TextBody',
          markdown: true,
          text:
            `*Correct Answer:* Option ${q.correctOptionId.toUpperCase()} (${correctOpt ? correctOpt.text : ''})\n\n` +
            `💡 *Explanation:* ${q.explanation}\n\n` +
            `🔗 *Source Reference:* [${q.source.title}](${q.source.url})\n` +
            `${q.source.url}`,
        }
      );
    });

    // Assist and official emergency links
    resultsChildren.push(
      { type: 'TextHeading', text: 'Official Support & Resources' },
      {
        type: 'TextBody',
        markdown: true,
        text: '• *Healthdirect Hotline:* 1800 022 222 (24/7 Registered Nurse advice)\n• *Emergency Services:* 000 (Ambulance, Fire, Police - life threats only)\n• *National Home Doctor:* 13 74 25 (After-hours bulk-billed home visits)',
      },
      {
        type: 'EmbeddedLink',
        text: 'Healthdirect Directory',
        'on-click-action': {
          name: 'open_url',
          url: 'https://www.healthdirect.gov.au/australian-health-services',
        },
      },
      {
        type: 'EmbeddedLink',
        text: 'Gov OSHC Guidelines',
        'on-click-action': {
          name: 'open_url',
          url: 'https://www.health.gov.au/our-work/overseas-student-health-cover-oshc',
        },
      }
    );

    // Payload mapping answers across screens
    const completePayload: Record<string, string> = {};
    questions.forEach((_, index) => {
      completePayload[`q${index + 1}`] = `\${screen.QUESTION_${index + 1}.form.q${index + 1}}`;
    });

    resultsChildren.push({
      type: 'Footer',
      label: 'Claim XP & Save Results 🏆',
      'on-click-action': {
        name: 'complete',
        payload: completePayload,
      },
    });

    const resultsScreen = {
      id: 'RESULTS',
      title: 'Review & Answers',
      terminal: true,
      success: true,
      layout: {
        type: 'SingleColumnLayout',
        children: resultsChildren,
      },
    };

    return {
      version: '7.3',
      routing_model,
      screens: [lessonScreen, ...questionScreens, resultsScreen],
    };
  }

  async handle(response: FlowResponse, context: FlowContext): Promise<void> {
    const contactId = context.contactId;
    if (!contactId) return;

    // Record submission into flow_submissions
    await this.db.query(
      'INSERT INTO flow_submissions (id, flow_name, flow_token, phone, response_json, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id(), this.name, response.flowToken || context.flowToken || null, context.phone, JSON.stringify(response), now()]
    );

    // Find active quiz session for this contact
    let session = (
      await this.db.query<{ id: string; question_ids: string[]; earned_xp: number }>(
        "SELECT id, question_ids, earned_xp FROM quiz_sessions WHERE contact_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
        [contactId]
      )
    ).rows[0];

    // If no active session found, resolve from completed_sessions
    if (!session) {
      const stateRes = await this.db.query<{ completed_sessions: number }>(
        'SELECT completed_sessions FROM user_quiz_state WHERE contact_id = $1',
        [contactId]
      );
      const completedSessions = stateRes.rows[0]?.completed_sessions || 0;
      const config = getSessionConfig(completedSessions);
      if (!config) {
        await sendText(
          catalogueConfig.phoneNumberId,
          context.phone,
          `You have completed all ${TOTAL_CURRICULUM_QUESTIONS} questions and earned all ${TOTAL_CURRICULUM_XP} XP. Congratulations! You are eligible for a free health checkup.`
        );
        return;
      }
      const sessionId = id();
      await this.db.query(
        "INSERT INTO quiz_sessions (id, contact_id, topic, difficulty, question_ids, status) VALUES ($1, $2, $3, 1, $4, 'active')",
        [sessionId, contactId, config.topic, JSON.stringify(config.questionIds)]
      );
      session = { id: sessionId, question_ids: config.questionIds, earned_xp: 0 };
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

    const existingEarned = (
      await this.db.query<{ earned_question_ids: string[] }>(
        'SELECT earned_question_ids FROM user_quiz_state WHERE contact_id = $1',
        [contactId]
      )
    ).rows[0]?.earned_question_ids || [];

    questions.forEach((q, index) => {
      const fieldKey = `q${index + 1}`;
      const rawAnswer = String(response[fieldKey] || (response.data as Record<string, unknown>)?.[fieldKey] || '').trim().toLowerCase();
      const isCorrect = rawAnswer === q.correctOptionId.toLowerCase();

      if (isCorrect) {
        correctCount++;
        const firstTime = !existingEarned.includes(q.id) && !newCorrectIds.includes(q.id);
        if (firstTime) {
          earnedXp += q.xp;
          newCorrectIds.push(q.id);
        }
        breakdownLines.push(
          `Q${index + 1}: Correct! ${firstTime ? `(+${q.xp} XP)` : ''}\n${q.explanation}\n🔗 Source: ${q.source.title} (${q.source.url})`
        );
      } else {
        breakdownLines.push(
          `Q${index + 1}: Not quite. (Correct answer was ${q.correctOptionId.toUpperCase()})\n${q.explanation}\n🔗 Source: ${q.source.title} (${q.source.url})`
        );
      }
    });

    // Update user_quiz_state in database
    for (const qid of newCorrectIds) {
      await this.db.query(
        'UPDATE user_quiz_state SET earned_question_ids = earned_question_ids || to_jsonb($2::text), updated_at = $3 WHERE contact_id = $1',
        [contactId, qid, now()]
      );
    }
    await this.db.query(
      "UPDATE user_quiz_state SET completed_sessions = completed_sessions + 1, next_reminder_at = now() + interval '7 days', updated_at = now() WHERE contact_id = $1",
      [contactId]
    );

    // Update session status to completed
    await this.db.query(
      "UPDATE quiz_sessions SET current_index = $2, earned_xp = $3, status = 'completed', completed_at = $4 WHERE id = $1",
      [session.id, questionIds.length, earnedXp, now()]
    );

    // Calculate total progress
    const updatedState = (
      await this.db.query<{ earned_question_ids: string[]; completed_sessions: number }>(
        'SELECT earned_question_ids, completed_sessions FROM user_quiz_state WHERE contact_id = $1',
        [contactId]
      )
    ).rows[0];

    const totalMastered = updatedState?.earned_question_ids?.length || 0;
    const totalXp = (updatedState?.earned_question_ids || []).reduce((sum, qid) => {
      const match = QUESTION_BANK.find((q) => q.id === qid);
      return sum + (match?.xp || 0);
    }, 0);
    const eligible = totalMastered >= TOTAL_CURRICULUM_QUESTIONS;

    const summaryText = [
      `🎉 Quiz Session Complete!`,
      ``,
      `Score: ${correctCount}/${questions.length} correct`,
      `XP Earned this session: +${earnedXp} XP`,
      `Total Progress: ${totalXp}/${TOTAL_CURRICULUM_XP} XP (${totalMastered}/${TOTAL_CURRICULUM_QUESTIONS} questions mastered)`,
      ...(eligible ? [`\n🏆 Congratulations! You have mastered all questions and qualify for your free health checkup!`] : []),
      ``,
      `Detailed Breakdown:`,
      breakdownLines.join('\n\n'),
      ``,
      `You can reply QUIZ at any time to take your next learning session.`,
    ].join('\n');

    await sendText(catalogueConfig.phoneNumberId, context.phone, summaryText);
  }
}
