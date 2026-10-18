/**
 * Writes the single canonical WhatsApp Flow JSON that operators import into
 * Kapso: `flows/oshc_quiz_flow.json`.
 *
 * Run this after editing the curriculum so the published artifact and the
 * grading code stay in sync. `tests/quiz-flow.test.ts` fails if the committed
 * file diverges from the generator.
 *
 * `--check` verifies the committed file without writing (used by CI / `npm run
 * flow:check`).
 */

import fs from "node:fs";

import {
  CANONICAL_QUIZ_FLOW_PATH,
  buildQuizFlowDefinition,
  canonicalFlowSessionNumber,
  serializeQuizFlow,
} from "../src/quiz/flow-definition.js";

const check = process.argv.includes("--check");
const expected = serializeQuizFlow();

if (check) {
  let actual = "";
  try {
    actual = fs.readFileSync(CANONICAL_QUIZ_FLOW_PATH, "utf8");
  } catch {
    console.error(`Missing Flow JSON: ${CANONICAL_QUIZ_FLOW_PATH}`);
    process.exit(1);
  }
  if (actual !== expected) {
    console.error(
      `Flow JSON is out of date: ${CANONICAL_QUIZ_FLOW_PATH}\nRun "npm run flow:export" and commit the result.`,
    );
    process.exit(1);
  }
  console.log(`Flow JSON is up to date: ${CANONICAL_QUIZ_FLOW_PATH}`);
  process.exit(0);
}

fs.mkdirSync(new URL("../flows/", import.meta.url), { recursive: true });
fs.writeFileSync(CANONICAL_QUIZ_FLOW_PATH, expected, "utf8");

const definition = buildQuizFlowDefinition();
console.log(
  `Exported quiz Flow (session ${canonicalFlowSessionNumber()}, ${definition.screens.length} screens) -> ${CANONICAL_QUIZ_FLOW_PATH}`,
);
