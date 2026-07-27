/**
 * @jest-environment node
 */

import {
  HARD_SPAM_SIGNAL_IDS,
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

  /** Andrew inbox-style pitches that Phase 1 backfill missed (2-signal floor too low). */
  const andrewInboxSpamSamples = [
    {
      label: "X followers + $3/mo subscriber tier / retweet / guides resell",
      message:
        "Hi — I help tutors grow on X. Get more followers with our $3/mo subscriber tier, retweet packs, and guides you can resell.",
    },
    {
      label: "SEO packages / Google visibility / organic traffic",
      message:
        "Want better Google visibility? Our SEO packages drive organic traffic to your tutoring site.",
    },
    {
      label: "$195 video ads / impactful video / unsubscribe.video",
      message:
        "We produce impactful video ads for your brand starting at $195. Manage preferences at unsubscribe.video",
    },
    {
      label: "Instagram growth / 300+ followers",
      message:
        "Grow your Instagram with 300+ followers in weeks — our growth service handles everything.",
    },
    {
      label: "searchregister.net / GoogleSearchIndex / domains@search-*",
      message:
        "Register at searchregister.net for GoogleSearchIndex. Questions? Email domains@search-index.net",
    },
    {
      label: "Cold usemynk.com visit + commercial CTA",
      message:
        "I just visited usemynk.com and love the product. We offer digital marketing packages — let me know if you're interested.",
    },
  ];

  const spamSamples: Array<{
    message: string;
    contactEmail?: string;
    minReasons: number;
    expectSpam?: boolean;
  }> = [
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
      minReasons: 1,
      expectSpam: true,
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
    ({ message, contactEmail, minReasons, expectSpam }) => {
      const result = scoreFeedbackSubmission({ message, contactEmail });
      expect(result.reasons.length).toBeGreaterThanOrEqual(minReasons);
      if (expectSpam ?? minReasons >= MIN_SPAM_SIGNALS) {
        expect(result.isSpam).toBe(true);
      }
    }
  );

  it.each(andrewInboxSpamSamples)(
    "flags Andrew inbox pitch: $label",
    ({ message }) => {
      const result = scoreFeedbackSubmission({ message });
      expect(result.isSpam).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(1);
    }
  );

  it("hard_spam_kit alone is sufficient (searchregister / unsubscribe.video)", () => {
    expect(
      scoreFeedbackSubmission({
        message: "Please visit searchregister.net to complete indexing.",
      }).isSpam
    ).toBe(true);
    expect(
      scoreFeedbackSubmission({
        message: "Unsubscribe at unsubscribe.video if you prefer.",
      }).isSpam
    ).toBe(true);
    expect(HARD_SPAM_SIGNAL_IDS.has("hard_spam_kit")).toBe(true);
  });

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
    expect(result.reasons).toEqual(["seo_terms"]);
  });

  it("backfill dry-run: Andrew inbox samples all score spam", () => {
    const flagged = andrewInboxSpamSamples.filter(
      (s) => scoreFeedbackSubmission({ message: s.message }).isSpam
    );
    expect(flagged).toHaveLength(andrewInboxSpamSamples.length);
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
