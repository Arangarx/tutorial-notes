"use client";

import { useEffect, useRef } from "react";

interface SeenTrackerProps {
  noteId: string;
  token: string;
}

/**
 * Invisible element placed inside each note card on the share page.
 * Uses IntersectionObserver to fire POST /api/share/mark-seen when the card
 * becomes at least 30% visible. Fire-and-forget — errors are silently swallowed
 * since this is a non-critical UX enhancement.
 */
export function SeenTracker({ noteId, token }: SeenTrackerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          observer.disconnect();
          fetch("/api/share/mark-seen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, noteId }),
          }).catch(() => {});
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [noteId, token]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    />
  );
}
