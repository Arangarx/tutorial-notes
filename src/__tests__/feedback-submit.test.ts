/**
 * @jest-environment node
 *
 * submitFeedback — honeypot silence, rate limit, spam routing.
 */

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const mockHeaders = jest.fn();
jest.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

const mockRateLimit = jest.fn();
jest.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const mockCreate = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    feedbackItem: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

import { submitFeedback } from "@/app/feedback/actions";

function feedbackForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("kind", overrides.kind ?? "FEEDBACK");
  fd.set("message", overrides.message ?? "mic died");
  fd.set("contactEmail", overrides.contactEmail ?? "");
  if (overrides.companyWebsite !== undefined) {
    fd.set("companyWebsite", overrides.companyWebsite);
  }
  return fd;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHeaders.mockResolvedValue(
    new Headers({
      "x-forwarded-for": "203.0.113.9",
      referer: "https://example.com/feedback",
    })
  );
  mockRateLimit.mockReturnValue({
    allowed: true,
    remaining: 4,
    retryAfterMs: 0,
  });
  mockCreate.mockResolvedValue({ id: "fb-1" });
});

describe("submitFeedback", () => {
  it("returns ok without DB write when honeypot is filled", async () => {
    const result = await submitFeedback(
      null,
      feedbackForm({ companyWebsite: "https://spam.example" })
    );
    expect(result).toEqual({ ok: true });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("returns rate-limit error when exceeded", async () => {
    mockRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      retryAfterMs: 3_600_000,
    });

    const result = await submitFeedback(null, feedbackForm());
    expect(result).toEqual({
      ok: false,
      error: "Too many submissions. Try again in an hour.",
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockRateLimit).toHaveBeenCalledWith("feedback:203.0.113.9", 5, 3_600_000);
  });

  it("stores INBOX for clean submissions", async () => {
    const result = await submitFeedback(null, feedbackForm());
    expect(result).toEqual({ ok: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "FEEDBACK",
        message: "mic died",
        status: "INBOX",
        spamReason: null,
        submitterIp: "203.0.113.9",
      }),
    });
  });

  it("stores SPAM but returns ok for heuristic spam", async () => {
    const result = await submitFeedback(
      null,
      feedbackForm({
        message:
          "Dear sir, we offer SEO packages and backlinks. Visit https://a.example https://b.example https://c.example",
        contactEmail: "spam@example.com",
      })
    );
    expect(result).toEqual({ ok: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SPAM",
        spamReason: expect.stringMatching(/seo_marketing|multi_url|cold_outreach/),
      }),
    });
  });
});
