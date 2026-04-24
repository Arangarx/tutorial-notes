"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render `children` as a child of `document.body` instead of the
 * caller's DOM position.
 *
 * Why this exists:
 *
 * `globals.css .card { backdrop-filter: blur(10px); }` (and any other
 * rule with `transform`, `filter`, `perspective`, `will-change`, or
 * `contain: paint`) creates a new stacking context per CSS spec. A
 * descendant `position: fixed` element is then anchored to the
 * stacking-context root rather than the viewport. Worse, sibling
 * stacking contexts that come AFTER the modal in DOM order paint on
 * top regardless of the modal's z-index, because root-level z-index
 * comparison only happens between elements within the SAME stacking
 * context.
 *
 * Symptom we hit: the consent modal on the student detail page
 * rendered visibly UNDER the "Send update email" card directly
 * beneath it. Bumping z-index did nothing because both cards each
 * created their own stacking context and the modal was trapped
 * inside the earlier one.
 *
 * Fix: portal the modal up to `<body>` so its `position: fixed` is
 * anchored to the viewport and its z-index is comparable against
 * everything else on the page.
 *
 * Usage:
 *   {open && (
 *     <ModalPortal>
 *       <div role="dialog" style={{ position: "fixed", inset: 0, ... }}>
 *         ...
 *       </div>
 *     </ModalPortal>
 *   )}
 *
 * The component renders `null` until after the first client-mount
 * tick so SSR + hydration stays in sync (the server renders nothing,
 * the first client render renders nothing, the second render —
 * triggered by `setMounted(true)` in a useEffect — renders the
 * portal). Without this guard React would throw a hydration
 * mismatch error in dev when the parent did SSR.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
