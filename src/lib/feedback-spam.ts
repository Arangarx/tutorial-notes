/**
 * Heuristic spam scoring for public /feedback submissions.
 *
 * Requires 2+ independent signals before flagging spam (low false-positive rate).
 * Disposable-email detection applies only when contactEmail is provided — empty
 * email is never blocked and never contributes a signal.
 */

export interface FeedbackSpamInput {
  message: string;
  contactEmail?: string | null;
}

export interface FeedbackSpamResult {
  isSpam: boolean;
  reasons: string[];
}

/** Minimum distinct signals before a submission is treated as spam. */
export const MIN_SPAM_SIGNALS = 2;

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "grr.la",
  "yopmail.com",
  "trashmail.com",
  "tempmail.com",
  "throwaway.email",
  "getnada.com",
  "maildrop.cc",
  "dispostable.com",
  "10minutemail.com",
  "temp-mail.org",
]);

type SignalChecker = {
  id: string;
  test: (message: string, contactEmail?: string | null) => boolean;
};

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function countUrls(text: string): number {
  const httpMatches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const wwwMatches = text.match(/\bwww\.[^\s<>"']+/gi) ?? [];
  return httpMatches.length + wwwMatches.length;
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

const SIGNAL_CHECKERS: SignalChecker[] = [
  {
    id: "seo_marketing",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /\bseo\b/.test(m) ||
        /search engine optimization/.test(m) ||
        /\bbacklinks?\b/.test(m) ||
        /\bguest post/.test(m) ||
        /digital marketing (package|services?)/.test(m) ||
        /rank (higher|#1|first) (on|in) google/.test(m) ||
        /increase (your )?web traffic/.test(m) ||
        /website (audit|optimization) (package|service)/.test(m)
      );
    },
  },
  {
    id: "social_growth",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /instagram followers/.test(m) ||
        /buy (instagram|tiktok|twitter|x) followers/.test(m) ||
        /grow your (instagram|tiktok|social media|x|twitter)/.test(m) ||
        /\b(tiktok|instagram|twitter|x) growth (service|package)/.test(m) ||
        /followers? (for sale|growth service)/.test(m)
      );
    },
  },
  {
    id: "video_ad_pitch",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /\$195\b/.test(m) ||
        /promotional video (ad|package|service)/.test(m) ||
        /video ad(s)? (for|starting at) \$?\d+/.test(m) ||
        /professional video (ad|commercial) (for|package)/.test(m)
      );
    },
  },
  {
    id: "search_index_scam",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /searchregister/.test(m) ||
        /googlesearchindex/.test(m) ||
        /google search index(ing)? service/.test(m) ||
        /submit (your )?site to (google|search engines)/.test(m)
      );
    },
  },
  {
    id: "multi_url",
    test: (message) => countUrls(message) >= 3,
  },
  {
    id: "cold_outreach",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /dear (sir|madam|webmaster|site owner)/.test(m) ||
        /hope this (email|message) finds you/.test(m) ||
        /to the (website|site) owner/.test(m) ||
        /i came across your website/.test(m)
      );
    },
  },
  {
    id: "commercial_pitch",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /\bwe offer\b/.test(m) ||
        /our team (specializes|can help|would love)/.test(m) ||
        /limited time offer/.test(m) ||
        /click here to (learn more|visit|see)/.test(m) ||
        /boost your (sales|revenue|conversions)/.test(m) ||
        /interested in (our|a) (package|service|offer)/.test(m)
      );
    },
  },
  {
    id: "disposable_email",
    test: (_message, contactEmail) => {
      if (!contactEmail || contactEmail.trim() === "") return false;
      const domain = emailDomain(contactEmail.trim());
      return domain !== null && DISPOSABLE_EMAIL_DOMAINS.has(domain);
    },
  },
];

export function scoreFeedbackSubmission(
  input: FeedbackSpamInput
): FeedbackSpamResult {
  const message = input.message ?? "";
  const contactEmail = input.contactEmail ?? null;

  const reasons = SIGNAL_CHECKERS.filter((checker) =>
    checker.test(message, contactEmail)
  ).map((checker) => checker.id);

  return {
    isSpam: reasons.length >= MIN_SPAM_SIGNALS,
    reasons,
  };
}

/** Truncate IP for storage (IPv6-safe max length). */
export function truncateSubmitterIp(ip: string | null | undefined): string | null {
  if (!ip || ip.trim() === "" || ip === "unknown") return null;
  return ip.trim().slice(0, 45);
}
