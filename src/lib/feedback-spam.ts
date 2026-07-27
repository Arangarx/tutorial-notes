/**
 * Heuristic spam scoring for public /feedback submissions.
 *
 * Default: 2+ independent signal IDs before flagging spam (low false-positive rate).
 * Exception: `hard_spam_kit` — known scam domains / sender patterns; one hit is enough.
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

/** Single-signal IDs that are high-confidence enough to flag alone. */
export const HARD_SPAM_SIGNAL_IDS = new Set(["hard_spam_kit"]);

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
    id: "hard_spam_kit",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /searchregister/.test(m) ||
        /googlesearchindex/.test(m) ||
        /unsubscribe\.video/.test(m) ||
        /domains@search[-.]/.test(m) ||
        /search[-.]register/.test(m)
      );
    },
  },
  {
    id: "seo_terms",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /\bseo\b/.test(m) ||
        /search engine optimization/.test(m) ||
        /\bbacklinks?\b/.test(m) ||
        /\bguest post/.test(m) ||
        /seo (package|services?|specialist)/.test(m)
      );
    },
  },
  {
    id: "visibility_traffic",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /google visibility/.test(m) ||
        /organic traffic/.test(m) ||
        /digital marketing (package|services?)/.test(m) ||
        /rank (higher|#1|first) (on|in) google/.test(m) ||
        /increase (your )?web traffic/.test(m) ||
        /website (audit|optimization) (package|service)/.test(m) ||
        /(improve|boost) (your )?(online )?(visibility|presence)/.test(m) ||
        /(show up|appear) (higher |better )?(on|in) google/.test(m)
      );
    },
  },
  {
    id: "follower_growth",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /instagram followers/.test(m) ||
        /\b(twitter|x) followers\b/.test(m) ||
        /buy (instagram|tiktok|twitter|x) followers/.test(m) ||
        /grow your (instagram|tiktok|social media|x|twitter)\b/.test(m) ||
        /grow on (x|twitter)\b/.test(m) ||
        /\b(tiktok|instagram|twitter|x) growth (service|package)/.test(m) ||
        /followers? (for sale|growth service)/.test(m) ||
        /\d+\+?\s*(instagram |tiktok |twitter |x )?followers/.test(m) ||
        /(get|gain) more followers/.test(m) ||
        /instagram growth/.test(m)
      );
    },
  },
  {
    id: "paid_social_tier",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /subscriber tier/.test(m) ||
        /\$\d+\s*\/\s*mo(?:nth)?\b/.test(m) ||
        /monetize your (x|twitter|instagram)/.test(m)
      );
    },
  },
  {
    id: "engagement_spam",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /\bretweet\b/.test(m) ||
        /resell (guides|content|ebooks?)/.test(m) ||
        /(guides|content|ebooks?) you can resell/.test(m)
      );
    },
  },
  {
    id: "video_price",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /\$195\b/.test(m) ||
        /video ad(s)? (for|starting at) \$?\d+/.test(m) ||
        /starting at \$?\d+.*\bvideo/.test(m) ||
        /\$\d+.*\bvideo ad/.test(m)
      );
    },
  },
  {
    id: "video_pitch",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /impactful video/.test(m) ||
        /promotional video (ad|package|service)/.test(m) ||
        /professional video (ad|commercial) (for|package)/.test(m) ||
        /(explainer|promo(tional)?) video (for|package|service)/.test(m)
      );
    },
  },
  {
    id: "search_index_scam",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /google search index(ing)? service/.test(m) ||
        /submit (your )?site to (google|search engines)/.test(m) ||
        /index (your )?(site|website) (on|with) google/.test(m)
      );
    },
  },
  {
    id: "multi_url",
    test: (message) => countUrls(message) >= 3,
  },
  {
    id: "cold_opener",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /dear (sir|madam|webmaster|site owner)/.test(m) ||
        /hope this (email|message) finds you/.test(m) ||
        /to the (website|site) owner/.test(m) ||
        /i came across your (website|site)/.test(m) ||
        /i (just )?visited (your )?(website|site)/.test(m) ||
        /i was (just )?(on|browsing) your (website|site)/.test(m) ||
        /i (just )?checked out (your )?(website|site)/.test(m)
      );
    },
  },
  {
    id: "commercial_cta",
    test: (message) => {
      const m = normalizeForMatch(message);
      return (
        /\bwe offer\b/.test(m) ||
        /our team (specializes|can help|would love)/.test(m) ||
        /limited time offer/.test(m) ||
        /click here to (learn more|visit|see)/.test(m) ||
        /boost your (sales|revenue|conversions)/.test(m) ||
        /interested in (our|a) (package|service|offer)/.test(m) ||
        /(free|complimentary) (consultation|audit|quote)/.test(m) ||
        /let me know if you.?re interested/.test(m) ||
        /reach out (to us |)if you.?d like/.test(m) ||
        /\bgrowth service\b/.test(m)
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

  const isHardSpam = reasons.some((id) => HARD_SPAM_SIGNAL_IDS.has(id));

  return {
    isSpam: isHardSpam || reasons.length >= MIN_SPAM_SIGNALS,
    reasons,
  };
}

/** Truncate IP for storage (IPv6-safe max length). */
export function truncateSubmitterIp(ip: string | null | undefined): string | null {
  if (!ip || ip.trim() === "" || ip === "unknown") return null;
  return ip.trim().slice(0, 45);
}
