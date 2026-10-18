/**
 * Canonical WhatsApp Flow definition for the OSHC quiz.
 *
 * The published artifact is a single JSON file (`flows/oshc_quiz_flow.json`)
 * that operators dump straight into Kapso. This module is the build-time
 * generator for that file and the runtime loader used to read it back, so the
 * committed JSON and the code that grades submissions can never drift.
 *
 * Scope: the published Flow encodes ONE fixed five-question session
 * (`CANONICAL_FLOW_SESSION_INDEX`). Sessions that the Flow does not contain are
 * delivered as text; see `resolvedQuizFlowId` and `canonicalFlowSessionNumber`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { FlowDefinition } from "../flows.js";
import { QUIZ_CURRICULUM, getSessionQuestions } from "./curriculum.js";

/** The curriculum session baked into the published Flow JSON. */
export const CANONICAL_FLOW_SESSION_INDEX = 0;

/** Absolute path to the single JSON file operators import into Kapso. */
export const CANONICAL_QUIZ_FLOW_PATH = fileURLToPath(
  new URL("../../flows/oshc_quiz_flow.json", import.meta.url),
);

const QUESTION_NAMES = [
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
] as const;

function questionScreenName(index: number): string {
  const name = QUESTION_NAMES[index];
  if (!name)
    throw new Error(
      `Quiz Flow supports at most ${QUESTION_NAMES.length} questions per session.`,
    );
  return `QUESTION_${name}`;
}

function questionFieldName(index: number): string {
  const name = QUESTION_NAMES[index];
  if (!name)
    throw new Error(
      `Quiz Flow supports at most ${QUESTION_NAMES.length} questions per session.`,
    );
  return `q_${name.toLowerCase()}`;
}

export function canonicalFlowSessionNumber(): number {
  return (QUIZ_CURRICULUM[CANONICAL_FLOW_SESSION_INDEX] || QUIZ_CURRICULUM[0])
    .sessionNumber;
}

/**
 * Builds the Flow JSON for a curriculum session.
 *
 * Meta Flow version 7.3:
 * - `LESSON`          — the informative briefing for the session.
 * - `QUESTION_ONE..N`  — one screen per question, collecting `q_one..q_five`.
 * - `RESULTS`         — answer review plus a single `complete` payload that
 *                       carries every `qN` answer back to the webhook.
 */
export function buildQuizFlowDefinition(
  sessionIndex = CANONICAL_FLOW_SESSION_INDEX,
): FlowDefinition {
  const session = QUIZ_CURRICULUM[sessionIndex] || QUIZ_CURRICULUM[0];
  const questions = getSessionQuestions(session);
  const totalQuestions = questions.length;

  // 1. Build routing model: LESSON -> QUESTION_ONE -> ... -> QUESTION_FIVE -> RESULTS
  const routing_model: Record<string, string[]> = {
    LESSON: [questionScreenName(0)],
  };

  questions.forEach((_, index) => {
    const current = questionScreenName(index);
    const next =
      index < totalQuestions - 1 ? questionScreenName(index + 1) : "RESULTS";
    routing_model[current] = [next];
  });
  routing_model["RESULTS"] = [];

  // 2. Screen 1: Informative Session
  const lessonScreen = {
    id: "LESSON",
    title: "OSHC Masterclass",
    terminal: false,
    layout: {
      type: "SingleColumnLayout",
      children: [
        { type: "TextHeading", text: "OSHC Masterclass 🇦🇺" },
        { type: "TextSubheading", text: session.title },
        { type: "TextBody", markdown: true, text: session.lesson },
        {
          type: "Footer",
          label: "Start Quiz ➔",
          "on-click-action": {
            name: "navigate",
            next: { type: "screen", name: questionScreenName(0) },
          },
        },
      ],
    },
  };

  // 3. Question Screens (one per question)
  const questionScreens = questions.map((q, index) => {
    const screenId = questionScreenName(index);
    const nextScreenId =
      index < totalQuestions - 1 ? questionScreenName(index + 1) : "RESULTS";
    const isLast = index === totalQuestions - 1;

    return {
      id: screenId,
      title: `Question ${index + 1} of ${totalQuestions}`,
      terminal: false,
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextHeading",
            text: `Question ${index + 1} of ${totalQuestions}`,
          },
          {
            type: "TextSubheading",
            text: `Level ${session.sessionNumber} • Earn +${q.xp} XP ⭐`,
          },
          { type: "TextBody", text: q.question },
          {
            type: "RadioButtonsGroup",
            name: questionFieldName(index),
            label: "Select your answer:",
            required: true,
            "data-source": q.options.map((opt) => ({
              id: `option_${opt.id}`,
              title: `Option ${opt.id.toUpperCase()}`,
              description: opt.text,
            })),
          },
          {
            type: "Footer",
            label: isLast ? "Review & Results ➔" : "Next Question ➔",
            "on-click-action": {
              name: "navigate",
              next: { type: "screen", name: nextScreenId },
            },
          },
        ],
      },
    };
  });

  // 4. Final Review & Results Screen
  const resultsChildren: Array<Record<string, unknown>> = [
    { type: "TextHeading", text: "🎉 Session Review & Answers" },
    {
      type: "TextSubheading",
      text: "Review key answers, explanations & resources:",
    },
  ];

  // Add answer & explanation card for each question
  questions.forEach((q, index) => {
    const correctOpt = q.options.find((o) => o.id === q.correctOptionId);
    resultsChildren.push(
      {
        type: "TextSubheading",
        text: `Question ${index + 1} (+${q.xp} XP)`,
      },
      {
        type: "TextBody",
        markdown: true,
        text:
          `*Correct Answer:* Option ${q.correctOptionId.toUpperCase()} (${correctOpt ? correctOpt.text : ""})\n\n` +
          `💡 *Explanation:* ${q.explanation}\n\n` +
          `🔗 *Source Reference:* [${q.source.title}](${q.source.url})\n` +
          `${q.source.url}`,
      },
    );
  });

  // Assist and official emergency links
  resultsChildren.push(
    { type: "TextHeading", text: "Official Support & Resources" },
    {
      type: "TextBody",
      markdown: true,
      text: "• *Healthdirect Hotline:* 1800 022 222 (24/7 Registered Nurse advice)\n• *Emergency Services:* 000 (Ambulance, Fire, Police - life threats only)\n• *National Home Doctor:* 13 74 25 (After-hours bulk-billed home visits)",
    },
    {
      type: "EmbeddedLink",
      text: "Healthdirect Directory",
      "on-click-action": {
        name: "open_url",
        url: "https://www.healthdirect.gov.au/australian-health-services",
      },
    },
    {
      type: "EmbeddedLink",
      text: "Gov OSHC Guidelines",
      "on-click-action": {
        name: "open_url",
        url: "https://www.health.gov.au/our-work/overseas-student-health-cover-oshc",
      },
    },
  );

  // Payload mapping answers across screens
  const completePayload: Record<string, string> = {};
  questions.forEach((_, index) => {
    completePayload[questionFieldName(index)] =
      `\${screen.${questionScreenName(index)}.form.${questionFieldName(index)}}`;
  });

  resultsChildren.push({
    type: "Footer",
    label: "Claim XP & Save Results 🏆",
    "on-click-action": {
      name: "complete",
      payload: completePayload,
    },
  });

  const resultsScreen = {
    id: "RESULTS",
    title: "Review & Answers",
    terminal: true,
    success: true,
    layout: {
      type: "SingleColumnLayout",
      children: resultsChildren,
    },
  };

  return {
    version: "7.3",
    routing_model,
    screens: [lessonScreen, ...questionScreens, resultsScreen],
  };
}

/** Reads the single canonical Flow JSON that is imported into Kapso. */
export function loadCanonicalQuizFlow(): FlowDefinition {
  return JSON.parse(
    readFileSync(CANONICAL_QUIZ_FLOW_PATH, "utf8"),
  ) as FlowDefinition;
}

/** Serialized form written by `scripts/export-flow.ts`. */
export function serializeQuizFlow(
  sessionIndex = CANONICAL_FLOW_SESSION_INDEX,
): string {
  return `${JSON.stringify(buildQuizFlowDefinition(sessionIndex), null, 2)}\n`;
}

/* ------------------------------------------------------------------ config */

let warnedPlaceholder = false;

function isPlaceholderFlowId(value: string): boolean {
  return /replace[-_ ]?with|placeholder|change[-_ ]?me|your[-_ ].*flow/i.test(
    value,
  );
}

/**
 * Resolves `QUIZ_FLOW_ID` for delivery.
 *
 * Placeholder values (`replace-with-...`) are treated as unset so a
 * half-configured environment degrades to the text fallback instead of sending
 * an invalid Flow ID to WhatsApp.
 */
export function resolvedQuizFlowId(): string | null {
  const raw = (process.env.QUIZ_FLOW_ID || "").trim();
  if (!raw) return null;
  if (isPlaceholderFlowId(raw)) {
    if (!warnedPlaceholder) {
      warnedPlaceholder = true;
      console.warn(
        "[quiz] QUIZ_FLOW_ID still holds a placeholder value; falling back to text. Set it to a published Meta Flow ID.",
      );
    }
    return null;
  }
  return raw;
}
