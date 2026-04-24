"use client";

import { useLayoutEffect } from "react";

const FOLLOW_UP_MS = [0, 50, 200, 400];

/**
 * Excalidraw moves focus into the canvas on mount. Browsers then
 * scroll the focused control into view, which can pull the *document*
 * down so the header and status chrome sit off-screen. Reset window
 * scroll a few times to win the async focus race. Safe for client-only
 * whiteboard pages.
 */
export function useWindowScrollToTopOnMount(): void {
  useLayoutEffect(() => {
    const scroll = () => {
      window.scrollTo(0, 0);
    };
    scroll();
    const ids = FOLLOW_UP_MS.map((ms) => window.setTimeout(scroll, ms));
    return () => {
      for (const id of ids) window.clearTimeout(id);
    };
  }, []);
}
