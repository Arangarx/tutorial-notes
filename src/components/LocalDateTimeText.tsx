"use client";

import { useLayoutEffect, useState } from "react";

const DEFAULT_OPTS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

type LocalDateTimeTextProps = {
  /** ISO 8601 (e.g. from `Date#toISOString()`). */
  dateTime: string;
  /**
   * Passed through to `Date#toLocaleString` in the **browser** so the
   * tutor's OS timezone and locale apply. Not run on the server — RSC/SSR
   * would format in the deployment region, which is wrong for this admin UI
   * (list on student page, Apr 2026).
   */
  options?: Intl.DateTimeFormatOptions;
  className?: string;
  /** Shown for SSR + the first client frame before we have local formatting. */
  placeholder?: string;
};

/**
 * Renders a `<time>` whose human-readable body is formatted with
 * `toLocaleString` on the **client** only, so the viewer's machine locale
 * and time zone are used. Avoids the common pitfall of calling
 * `toLocaleString` in a server component (UTC/data-center) or in the SSR
 * pass of a client component (Node's TZ).
 */
export function LocalDateTimeText({
  dateTime,
  options = DEFAULT_OPTS,
  className,
  placeholder = "…",
}: LocalDateTimeTextProps) {
  const [text, setText] = useState("");

  useLayoutEffect(() => {
    const fmt = options ?? DEFAULT_OPTS;
    setText(new Date(dateTime).toLocaleString(undefined, fmt));
  }, [dateTime, options]);

  if (!text) {
    return (
      <time dateTime={dateTime} className={className} aria-busy>
        {placeholder}
      </time>
    );
  }

  return (
    <time dateTime={dateTime} className={className}>
      {text}
    </time>
  );
}
