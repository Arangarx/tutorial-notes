"use client";

import { useLayoutEffect } from "react";

/**
 * Prevents the *browser document* from scrolling while the user pans the
 * Excalidraw surface (e.g. Space+drag) or when overscroll would "chain" to
 * the page. Excalidraw should own pan/zoom; without this, the window can
 * scroll and feel like the page is being dragged.
 *
 * Pairs with a flex column layout where the canvas uses flex:1; minHeight:0.
 */
export function useWhiteboardPageScrollLock(): void {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      overflowH: html.style.overflow,
      overflowB: body.style.overflow,
    };
    const prevOsh = html.style.getPropertyValue("overscroll-behavior");
    const prevOsb = body.style.getPropertyValue("overscroll-behavior");

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.setProperty("overscroll-behavior", "none");
    body.style.setProperty("overscroll-behavior", "none");

    return () => {
      html.style.overflow = prev.overflowH;
      body.style.overflow = prev.overflowB;
      if (prevOsh) html.style.setProperty("overscroll-behavior", prevOsh);
      else html.style.removeProperty("overscroll-behavior");
      if (prevOsb) body.style.setProperty("overscroll-behavior", prevOsb);
      else body.style.removeProperty("overscroll-behavior");
    };
  }, []);
}
