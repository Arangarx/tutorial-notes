/**
 * @jest-environment node
 */

import {
  MIN_SPAM_SIGNALS,
  scoreFeedbackSubmission,
  truncateSubmitterIp,
} from "@/lib/feedback-spam";

describe("scoreFeedbackSubmission", () => {
  const cleanSamples = [
    "mic died",
    "End button confusing",
    "The whiteboard froze when I switched pages.",
    "Love the app — would be nice to export notes as PDF.",
    "Bug: student could not hear me after reconnect.",
    "Recording stopped but the timer kept going.",
  ];

  const spamSamples: Array<{ message: string; contactEmail?: string; minReasons: number }> = [
    {
      message:
        "Dear sir, we offer SEO packages and backlinks. Visit https://spam.example/a https://spam.example/b https://spam.example/c",
      minReasons: MIN_SPAM_SIGNALS,
    },
    {
      message:
        "Hope this email finds you well. Grow your Instagram followers with our team — buy Instagram followers today!",
      minReasons: MIN_SPAM_SIGNALS,
    },
    {
      message:
        "Professional video ad for only $195. Our team specializes in promotional video packages for your website.",
      minReasons: MIN_SPAM_SIGNALS,
    },
    {
      message:
        "Register at searchregister.com for GoogleSearchIndex service. We offer website optimization packages.",
      minReasons: MIN_SPAM_SIGNALS,
    },
    {
      message:
        "Check https://a.example https://b.example https://c.example — limited time offer on digital marketing services.",
      minReasons: MIN_SPAM_SIGNALS,
    },
    {
      message: "Just checking in about my account.",
      contactEmail: "bot@mailinator.com",
      minReasons: 0,
    },
    {
      message:
        "Dear webmaster, we offer SEO services. Click here to learn more about our digital marketing package.",
      contactEmail: "pitch@mailinator.com",
      minReasons: MIN_SPAM_SIGNALS,
    },
  ];

  it.each(cleanSamples)("does not flag clean feedback: %s", (message) => {
    const result = scoreFeedbackSubmission({ message });
    expect(result.isSpam).toBe(false);
    expect(result.reasons.length).toBeLessThan(MIN_SPAM_SIGNALS);
  });

  it.each(spamSamples)(
    "flags spam sample with $minReasons+ signals",
    ({ message, contactEmail, minReasons }) => {
      const result = scoreFeedbackSubmission({ message, contactEmail });
      expect(result.reasons.length).toBeGreaterThanOrEqual(minReasons);
      if (minReasons >= MIN_SPAM_SIGNALS) {
        expect(result.isSpam).toBe(true);
      }
    }
  );

  it("treats disposable email as a single signal (not spam alone)", () => {
    const result = scoreFeedbackSubmission({
      message: "Quick question about billing.",
      contactEmail: "user@mailinator.com",
    });
    expect(result.reasons).toEqual(["disposable_email"]);
    expect(result.isSpam).toBe(false);
  });

  it("never scores empty contact email as disposable", () => {
    const result = scoreFeedbackSubmission({
      message: "mic died",
      contactEmail: "",
    });
    expect(result.reasons).not.toContain("disposable_email");
    expect(result.isSpam).toBe(false);
  });

  it("requires two signals — single SEO mention in short bug report is not spam", () => {
    const result = scoreFeedbackSubmission({
      message: "Search broke after I typed seo in the notes field.",
    });
    expect(result.isSpam).toBe(false);
  });
});

describe("truncateSubmitterIp", () => {
  it("returns null for unknown or empty", () => {
    expect(truncateSubmitterIp("unknown")).toBeNull();
    expect(truncateSubmitterIp("")).toBeNull();
    expect(truncateSubmitterIp(null)).toBeNull();
  });

  it("truncates long values", () => {
    const long = "a".repeat(60);
    expect(truncateSubmitterIp(long)?.length).toBe(45);
  });

  it("preserves normal IPv4", () => {
    expect(truncateSubmitterIp("203.0.113.42")).toBe("203.0.113.42");
  });
});
