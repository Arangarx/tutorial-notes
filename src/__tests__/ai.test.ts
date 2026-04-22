/**
 * Unit tests for src/lib/ai.ts
 * Mocks the OpenAI SDK so no real API calls are made.
 */

// Must mock before importing the module under test.
const mockCreate = jest.fn();
jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Mock env so we can control OPENAI_API_KEY per test.
jest.mock("@/lib/env", () => ({
  env: { OPENAI_API_KEY: "sk-test-key" },
}));

import {
  generateSessionNote,
  PROMPT_VERSION,
  estimateTokens,
  MAX_INPUT_TOKENS,
} from "@/lib/ai";

beforeEach(() => {
  mockCreate.mockReset();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("returns topics/homework/assessment/plan/links on a valid OpenAI response", async () => {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({
            topics: "Quadratic equations, factoring",
            homework: "Worksheet pg 4-6",
            assessment: "Comfortable with factoring; struggles with negative coefficients",
            plan: "Move on to factoring next session",
            links: "",
          }),
        },
      },
    ],
  });

  const result = await generateSessionNote({
    studentName: "Alex",
    sessionText: "We did quad equations today.",
  });

  expect(result).toMatchObject({
    topics: "Quadratic equations, factoring",
    homework: "Worksheet pg 4-6",
    assessment: "Comfortable with factoring; struggles with negative coefficients",
    plan: "Move on to factoring next session",
    links: "",
    promptVersion: PROMPT_VERSION,
  });
});

test("accepts legacy `nextSteps` JSON field as `plan` for backwards compat", async () => {
  // If the model echoes the old key (rare with json_object mode but free
  // to handle), we should still surface it as `plan`.
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({
            topics: "t",
            homework: "h",
            assessment: "a",
            nextSteps: "legacy plan",
            links: "",
          }),
        },
      },
    ],
  });

  const result = await generateSessionNote({
    studentName: "Alex",
    sessionText: "x",
  });

  expect(result).toMatchObject({ plan: "legacy plan" });
});

// ---------------------------------------------------------------------------
// Prompt shape snapshot — changing the prompt is intentional, not accidental
// ---------------------------------------------------------------------------

test("sends the correct model, json_object response_format, and token limits", async () => {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({ topics: "t", homework: "h", assessment: "a", plan: "p" }),
        },
      },
    ],
  });

  await generateSessionNote({
    studentName: "Jordan",
    sessionText: "Some session text.",
    template: "Math session",
  });

  expect(mockCreate).toHaveBeenCalledTimes(1);
  const call = mockCreate.mock.calls[0][0];
  expect(call.model).toBe("gpt-4o-mini");
  expect(call.response_format).toEqual({ type: "json_object" });
  expect(call.max_tokens).toBe(800);

  // System message must exist and enforce strict / terse rules
  const systemMsg = call.messages.find((m: { role: string }) => m.role === "system");
  expect(systemMsg).toBeDefined();
  expect(systemMsg.content).toContain("tutoring assistant");
  expect(systemMsg.content).toContain("terse");

  // User message must include the template and the BARE ESSENTIALS contract.
  // Student name is intentionally NOT in the v6 prompt — Sarah's feedback was
  // that parents only need today's facts, not "Alex did X today" padding.
  const userMsg = call.messages.find((m: { role: string }) => m.role === "user");
  expect(userMsg).toBeDefined();
  expect(userMsg.content).toContain("Math session");
  expect(userMsg.content).toContain("BARE ESSENTIALS");
  expect(userMsg.content).toContain('"assessment"');
  expect(userMsg.content).toContain('"plan"');
});

test("accepts recent note context (RecentNoteContext.plan) without throwing", async () => {
  // The current v6 prompt does not actually inject recentNotes into the
  // text — Sarah wanted bare-essentials output, not "previously we did X"
  // padding. This test locks in that the input shape is still accepted so
  // callers don't have to special-case it. If we reintroduce recent-note
  // context later, expand this test to assert the strings appear.
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({ topics: "t", homework: "h", assessment: "a", plan: "p" }),
        },
      },
    ],
  });

  await expect(
    generateSessionNote({
      studentName: "Sam",
      sessionText: "Review session.",
      recentNotes: [
        {
          date: new Date("2026-04-10T00:00:00Z"),
          topics: "Fractions",
          plan: "Practice word problems",
        },
      ],
    })
  ).resolves.not.toHaveProperty("error");
});

// ---------------------------------------------------------------------------
// Malformed JSON
// ---------------------------------------------------------------------------

test("returns { error } when OpenAI returns malformed JSON (no throw)", async () => {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: "not valid json{{" } }],
  });

  const result = await generateSessionNote({
    studentName: "Sam",
    sessionText: "Some notes.",
  });

  expect(result).toHaveProperty("error");
  expect((result as { error: string }).error).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Network / API error
// ---------------------------------------------------------------------------

test("returns { error } on network error (no throw)", async () => {
  mockCreate.mockRejectedValueOnce(new Error("Connection refused"));

  const result = await generateSessionNote({
    studentName: "Kim",
    sessionText: "Some notes.",
  });

  expect(result).toHaveProperty("error");
});

// ---------------------------------------------------------------------------
// Missing API key
// ---------------------------------------------------------------------------

test("returns { error: 'not configured' } immediately when OPENAI_API_KEY is absent", async () => {
  // Override the env mock for this test only
  jest.resetModules();

  jest.doMock("@/lib/env", () => ({ env: { OPENAI_API_KEY: undefined } }));
  jest.doMock("openai", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  }));

  const { generateSessionNote: generateNoKey } = await import("@/lib/ai");

  const result = await generateNoKey({
    studentName: "Taylor",
    sessionText: "Some notes.",
  });

  expect(result).toEqual({ error: "not configured" });
  expect(mockCreate).not.toHaveBeenCalled();

  jest.resetModules();
});

// ---------------------------------------------------------------------------
// Missing fields in JSON response are coerced to empty string
// ---------------------------------------------------------------------------

test("falls back to empty string for missing JSON fields", async () => {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify({ topics: "Only topics returned" }) } }],
  });

  const result = await generateSessionNote({
    studentName: "Lee",
    sessionText: "Partial notes.",
  });

  expect(result).toMatchObject({
    topics: "Only topics returned",
    homework: "",
    assessment: "",
    plan: "",
    links: "",
  });
});

// ---------------------------------------------------------------------------
// Utility: estimateTokens
// ---------------------------------------------------------------------------

test("estimateTokens returns roughly chars/4", () => {
  expect(estimateTokens("aaaa")).toBe(1);
  expect(estimateTokens("a".repeat(400))).toBe(100);
});

test("MAX_INPUT_TOKENS is exported and is a number", () => {
  expect(typeof MAX_INPUT_TOKENS).toBe("number");
  expect(MAX_INPUT_TOKENS).toBeGreaterThan(0);
});
