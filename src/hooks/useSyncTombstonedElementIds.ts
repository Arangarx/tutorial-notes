"use client";

import { useCallback, useRef } from "react";

const DEFAULT_TOMBSTONE_MS = 8_000;

function elementIdOf(el: unknown): string | null {
  if (!el || typeof el !== "object") return null;
  const id = (el as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

/**
 * Snapshot sync (full `elements` over the wire) cannot express "I deleted
 * this id" the way Yjs+CRDT can. A peer's slightly older message can still
 * contain shapes we just removed (Undo) — `reconcileElements` would bring them
 * back. We tombstone **locally removed** ids for a short window and drop
 * those ids from the remote payload before reconciling, so a delete/undo
 * isn't immediately undone by a stale peer snapshot.
 */
export function useSyncTombstonedElementIds(tombstoneMs = DEFAULT_TOMBSTONE_MS) {
  const expiresAt = useRef(new Map<string, number>());
  const prevLocalIds = useRef<Set<string> | null>(null);

  const onLocalElementSnapshot = useCallback(
    (elements: ReadonlyArray<unknown>) => {
      const now = new Set<string>();
      for (const el of elements) {
        const id = elementIdOf(el);
        if (id) {
          now.add(id);
          expiresAt.current.delete(id);
        }
      }
      const prev = prevLocalIds.current;
      if (prev) {
        for (const id of prev) {
          if (!now.has(id)) {
            expiresAt.current.set(id, Date.now() + tombstoneMs);
          }
        }
      }
      prevLocalIds.current = now;
    },
    [tombstoneMs]
  );

  const shouldDropRemoteElement = useCallback((id: string) => {
    const until = expiresAt.current.get(id);
    if (until == null) return false;
    if (Date.now() > until) {
      expiresAt.current.delete(id);
      return false;
    }
    return true;
  }, []);

  return { onLocalElementSnapshot, shouldDropRemoteElement };
}
