import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { OshcQuizFlow } from "../src/quiz/flow.js";
import {
  CANONICAL_QUIZ_FLOW_PATH,
  buildQuizFlowDefinition,
  canonicalFlowSessionNumber,
  serializeQuizFlow,
} from "../src/quiz/flow-definition.js";
import { QUIZ_CURRICULUM } from "../src/quiz/curriculum.js";
import type { Database } from "../src/db.js";

vi.mock("../src/kapso.js", () => ({
  sendText: vi.fn().mockResolvedValue({ message_id: "mock-id" }),
  sendFlow: vi.fn().mockResolvedValue({ message_id: "mock-flow-id" }),
  createKapsoClient: vi.fn(),
}));

const QUESTION_COUNT = QUIZ_CURRICULUM[0].questionIds.length;

describe("quiz Flow definition", () => {
  it("builds a valid Meta Flow v7.3 multi-screen structure", () => {
    const def = buildQuizFlowDefinition(0);

    expect(def.version).toBe("7.3");
    expect(def.routing_model).toEqual({
      LESSON: ["QUESTION_ONE"],
      QUESTION_ONE: ["QUESTION_TWO"],
      QUESTION_TWO: ["QUESTION_THREE"],
      QUESTION_THREE: ["QUESTION_FOUR"],
      QUESTION_FOUR: ["QUESTION_FIVE"],
      QUESTION_FIVE: ["RESULTS"],
      RESULTS: [],
    });

    // 1 lesson + N question screens + 1 results screen
    expect(def.screens.length).toBe(QUESTION_COUNT + 2);
    expect(def.screens[0].id).toBe("LESSON");
    expect(def.screens[0].terminal).toBe(false);

    for (let i = 1; i <= QUESTION_COUNT; i++) {
      expect(def.screens[i].id).toBe(
        `QUESTION_${["ONE", "TWO", "THREE", "FOUR", "FIVE"][i - 1]}`,
      );
      expect(def.screens[i].terminal).toBe(false);
    }

    const resultsScreen = def.screens[def.screens.length - 1];
    expect(resultsScreen.id).toBe("RESULTS");
    expect(resultsScreen.terminal).toBe(true);
  });

  it("collects identifier-safe answers and carries them in the complete payload", () => {
    const def = buildQuizFlowDefinition(0);
    const names: string[] = [];
    for (let i = 1; i <= QUESTION_COUNT; i++) {
      names.push(`q_${["one", "two", "three", "four", "five"][i - 1]}`);
    }

    const questionScreens = def.screens.slice(1, 1 + QUESTION_COUNT);
    const collected = questionScreens.map((screen) => {
      const children = (
        screen.layout as { children: Array<Record<string, unknown>> }
      ).children;
      const radio = children.find(
        (child) => child.type === "RadioButtonsGroup",
      );
      return radio?.name;
    });
    expect(collected).toEqual(names);

    const resultsChildren = (
      def.screens[def.screens.length - 1].layout as {
        children: Array<Record<string, unknown>>;
      }
    ).children;
    const footer = resultsChildren.find((child) => child.type === "Footer") as {
      "on-click-action": { name: string; payload: Record<string, string> };
    };
    expect(footer["on-click-action"].name).toBe("complete");
    expect(Object.keys(footer["on-click-action"].payload)).toEqual(names);
  });

  it("keeps the committed JSON identical to the generator", () => {
    const committed = readFileSync(CANONICAL_QUIZ_FLOW_PATH, "utf8");
    expect(committed).toBe(serializeQuizFlow());
  });

  it("loads the published Flow JSON as the single source of truth", () => {
    const flow = new OshcQuizFlow({
      query: vi.fn(),
      close: vi.fn(),
    } as unknown as Database);
    expect(flow.name).toBe("oshc_quiz_flow");
    expect(flow.definition()).toEqual(buildQuizFlowDefinition());
  });

  it("publishes the canonical session number", () => {
    expect(canonicalFlowSessionNumber()).toBe(QUIZ_CURRICULUM[0].sessionNumber);
  });
});

describe("OshcQuizFlow submissions", () => {
  it("accepts both explicit flowName and correlated flowToken", () => {
    const mockDb: Database = { query: vi.fn(), close: vi.fn() };
    const flow = new OshcQuizFlow(mockDb);

    expect(
      flow.accepts(
        { flowName: "oshc_quiz_flow" },
        { phone: "+15551234567", data: {} },
      ),
    ).toBe(true);
    expect(
      flow.accepts(
        { flowName: "flow", flowToken: "oshc_quiz_flow:sess123:user456" },
        { phone: "+15551234567", data: {} },
      ),
    ).toBe(true);
    expect(
      flow.accepts(
        { flowName: "other_flow" },
        { phone: "+15551234567", data: {} },
      ),
    ).toBe(false);
  });

  it("grades submitted answers, updates XP, and completes session", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const mockDb: Database = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        if (
          text.includes(
            "FROM quiz_sessions WHERE contact_id = $1 AND status = 'active'",
          )
        ) {
          return {
            rowCount: 1,
            rows: [
              {
                id: "sess-test",
                question_ids: [
                  "find_hc_1",
                  "find_hc_2",
                  "find_hc_3",
                  "find_hc_4",
                  "find_hc_5",
                ],
                earned_xp: 0,
              },
            ],
          } as any;
        }
        if (
          text.includes(
            "SELECT earned_question_ids FROM user_quiz_state WHERE contact_id = $1",
          )
        ) {
          return { rowCount: 1, rows: [{ earned_question_ids: [] }] } as any;
        }
        if (
          text.includes(
            "SELECT earned_question_ids, completed_sessions FROM user_quiz_state WHERE contact_id = $1",
          )
        ) {
          return {
            rowCount: 1,
            rows: [
              {
                earned_question_ids: ["find_hc_1", "find_hc_2"],
                completed_sessions: 1,
              },
            ],
          } as any;
        }
        return { rowCount: 1, rows: [] } as any;
      }),
      close: vi.fn(),
    };

    const flow = new OshcQuizFlow(mockDb);

    const submission = {
      flowName: "oshc_quiz_flow",
      q_one: "option_b",
      q_two: "option_b",
      q_three: "wrong",
      q_four: "wrong",
      q_five: "wrong",
    };

    await flow.handle(submission, {
      phone: "+15551234567",
      contactId: "contact-test",
      data: submission,
    });

    expect(
      queries.some((q) => q.text.includes("INSERT INTO flow_submissions")),
    ).toBe(true);
    expect(
      queries.some((q) =>
        q.text.includes("UPDATE user_quiz_state SET earned_question_ids"),
      ),
    ).toBe(true);
    expect(
      queries.some((q) =>
        q.text.includes("completed_sessions = completed_sessions + 1"),
      ),
    ).toBe(true);
    expect(queries.some((q) => q.text.includes("status = 'completed'"))).toBe(
      true,
    );
  });
});
