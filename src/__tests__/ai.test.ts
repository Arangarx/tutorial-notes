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

test("returns topics/homework/nextSteps on a valid OpenAI response", async () => {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({
            topics: "We covered quadratic equations.",
            homework: "Complete worksheet 4-6.",
            nextSteps: "Move on to factoring next session.",
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
    topics: "We covered quadratic equations.",
    homework: "Complete worksheet 4-6.",
    nextSteps: "Move on to factoring next session.",
    promptVersion: PROMPT_VERSION,
  });
});

// ---------------------------------------------------------------------------
// Prompt shape snapshot — changing the prompt is intentional, not accidental
// ---------------------------------------------------------------------------

test("sends the correct model, json_object response_format, and token limits", async () => {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({ topics: "t", homework: "h", nextSteps: "n" }),
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

  // System message must exist
  const systemMsg = call.messages.find((m: { role: string }) => m.role === "system");
  expect(systemMsg).toBeDefined();
  expect(systemMsg.content).toContain("tutoring assistant");

  // User message must include student name and template
  const userMsg = call.messages.find((m: { role: string }) => m.role === "user");
  expect(userMsg).toBeDefined();
  expect(userMsg.content).toContain("Jordan");
  expect(userMsg.content).toContain("Math session");
});

test("injects recent note context into user prompt", async () => {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({ topics: "t", homework: "h", nextSteps: "n" }),
        },
      },
    ],
  });

  await generateSessionNote({
    studentName: "Sam",
    sessionText: "Review session.",
    recentNotes: [
      {
        date: new Date("2026-04-10T00:00:00Z"),
        topics: "Fractions",
        nextSteps: "Practice word problems",
      },
    ],
  });

  const userMsg = mockCreate.mock.calls[0][0].messages.find(
    (m: { role: string }) => m.role === "user"
  );
  expect(userMsg.content).toContain("Fractions");
  expect(userMsg.content).toContain("Practice word problems");
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
    nextSteps: "",
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
