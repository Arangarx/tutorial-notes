"use client";

/**
 * Merges a peer's full scene snapshot into the local Excalidraw instance
 * using Excalidraw's `reconcileElements` (same helper their collab / Firebase
 * save path uses). Without this, `updateScene({ elements: remote })` replaces
 * the entire array and the last 50ms snapshot wins — concurrent strokes
 * vanish, and erasers can appear to "snap" wrong until the next message.
 *
 * @see `packages/excalidraw/data/reconcile.ts` in upstream Excalidraw.
 */

import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

function elementIdOf(el: unknown): string | null {
  if (!el || typeof el !== "object") return null;
  const id = (el as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export type MergeRemoteSceneOptions = {
  /**
   * Ids to strip from the peer snapshot before `reconcileElements`
   * (see `useSyncTombstonedElementIds` — undoes/ deletes vs stale full scenes).
   */
  shouldDropRemoteElement?: (elementId: string) => boolean;
};

/**
 * Dynamic import so the tutor/student first paint is not forced to
 * fully initialize `@excalidraw/excalidraw` before `next/dynamic` loads
 * the Excalidraw component chunk.
 */
export async function updateSceneMergingWithRemote(
  excalidrawAPI: ExcalidrawApiLike,
  remoteElements: ReadonlyArray<ExcalidrawLikeElement | unknown>,
  options?: MergeRemoteSceneOptions
): Promise<void> {
  const { reconcileElements } = await import("@excalidraw/excalidraw");
  const { shouldDropRemoteElement } = options ?? {};
  const filteredRemote: ExcalidrawLikeElement[] = shouldDropRemoteElement
    ? (remoteElements as ExcalidrawLikeElement[]).filter((el) => {
        const id = el.id ?? elementIdOf(el);
        if (typeof id !== "string") return true;
        return !shouldDropRemoteElement(id);
      })
    : (remoteElements as ExcalidrawLikeElement[]);
  const local = excalidrawAPI.getSceneElements() as Parameters<
    typeof reconcileElements
  >[0];
  const appState = excalidrawAPI.getAppState() as Parameters<
    typeof reconcileElements
  >[2];
  const merged = reconcileElements(
    local,
    filteredRemote as unknown as Parameters<typeof reconcileElements>[1],
    appState
  );
  excalidrawAPI.updateScene({
    elements: merged as ReadonlyArray<unknown>,
  });
}
