import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendFlow, sendText } from "../src/kapso.js";
import { startQuizForContact } from "../src/quiz/service.js";
import { resolvedQuizFlowId } from "../src/quiz/flow-definition.js";
import { QUIZ_CURRICULUM } from "../src/quiz/curriculum.js";
import type { Database } from "../src/db.js";

vi.mock("../src/kapso.js", () => ({
  sendText: vi.fn().mockResolvedValue({ message_id: "mock-text-id" }),
  sendFlow: vi.fn().mockResolvedValue({ message_id: "mock-flow-id" }),
  createKapsoClient: vi.fn(),
}));

const sendFlowMock = vi.mocked(sendFlow);
const sendTextMock = vi.mocked(sendText);

const ORIGINAL = {
  flowId: process.env.QUIZ_FLOW_ID,
  phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
};

function mockDb(state: { completed_sessions: number }): Database {
  return {
    query: vi.fn(async (text: string) => {
      if (
        text.includes(
          "SELECT earned_question_ids, completed_sessions FROM user_quiz_state",
        )
      ) {
        return {
          rowCount: 1,
          rows: [
            {
              earned_question_ids: [],
              completed_sessions: state.completed_sessions,
            },
          ],
        } as any;
      }
      return { rowCount: 1, rows: [] } as any;
    }),
    close: vi.fn(),
  } as unknown as Database;
}

beforeEach(() => {
  sendFlowMock.mockReset();
  sendFlowMock.mockResolvedValue({ message_id: "mock-flow-id" } as any);
  sendTextMock.mockReset();
  sendTextMock.mockResolvedValue({ message_id: "mock-text-id" } as any);
  process.env.KAPSO_PHONE_NUMBER_ID = "1285368921324624";
  delete process.env.QUIZ_FLOW_ID;
});

afterEach(() => {
  if (ORIGINAL.flowId === undefined) delete process.env.QUIZ_FLOW_ID;
  else process.env.QUIZ_FLOW_ID = ORIGINAL.flowId;
  if (ORIGINAL.phoneNumberId === undefined)
    delete process.env.KAPSO_PHONE_NUMBER_ID;
  else process.env.KAPSO_PHONE_NUMBER_ID = ORIGINAL.phoneNumberId;
});

describe("resolvedQuizFlowId", () => {
  it("is null when unset or blank", () => {
    expect(resolvedQuizFlowId()).toBeNull();
    process.env.QUIZ_FLOW_ID = "   ";
    expect(resolvedQuizFlowId()).toBeNull();
  });

  it("treats placeholder values as unset", () => {
    process.env.QUIZ_FLOW_ID = "replace-with-published-quiz-flow-id";
    expect(resolvedQuizFlowId()).toBeNull();
    process.env.QUIZ_FLOW_ID = "YOUR_FLOW_ID";
    expect(resolvedQuizFlowId()).toBeNull();
  });

  it("returns a real published Flow ID", () => {
    process.env.QUIZ_FLOW_ID = "1197715005513101";
    expect(resolvedQuizFlowId()).toBe("1197715005513101");
  });
});

describe("startQuizForContact Flow delivery", () => {
  it('sends the Flow and reports delivery "flow" when configured', async () => {
    process.env.QUIZ_FLOW_ID = "1197715005513101";
    const db = mockDb({ completed_sessions: 0 });

    const result = await startQuizForContact(db, {
      id: "contact-1",
      phone: "+61400000000",
    });

    expect(result.delivery).toBe("flow");
    expect(sendFlowMock).toHaveBeenCalledTimes(1);
    expect(sendFlowMock.mock.calls[0][0]).toMatchObject({
      flowId: "1197715005513101",
      screen: "LESSON",
    });
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it("rolls back the session when Flow delivery fails", async () => {
    process.env.QUIZ_FLOW_ID = "1197715005513101";
    const db = mockDb({ completed_sessions: 0 });
    sendFlowMock.mockRejectedValueOnce(new Error("kapso down"));

    await expect(
      startQuizForContact(db, { id: "contact-1", phone: "+61400000000" }),
    ).rejects.toThrow("kapso down");

    const deleted = (
      db.query as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.some(
      (call) =>
        typeof call[0] === "string" &&
        (call[0] as string).includes("DELETE FROM quiz_sessions WHERE id = $1"),
    );
    expect(deleted).toBe(true);
  });

  it("falls back to text for sessions the published Flow does not encode", async () => {
    process.env.QUIZ_FLOW_ID = "1197715005513101";
    const db = mockDb({ completed_sessions: 1 });

    const result = await startQuizForContact(db, {
      id: "contact-1",
      phone: "+61400000000",
    });

    expect(result.delivery).toBe("text");
    expect(result.sessionNumber).toBe(QUIZ_CURRICULUM[1].sessionNumber);
    expect(sendFlowMock).not.toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledTimes(1);
  });

  it("uses text when QUIZ_FLOW_ID is a placeholder", async () => {
    process.env.QUIZ_FLOW_ID = "replace-with-published-quiz-flow-id";
    const db = mockDb({ completed_sessions: 0 });

    const result = await startQuizForContact(db, {
      id: "contact-1",
      phone: "+61400000000",
    });

    expect(result.delivery).toBe("text");
    expect(sendFlowMock).not.toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledTimes(1);
  });
});
