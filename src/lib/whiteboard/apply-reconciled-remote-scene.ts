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

import { reconcileElements } from "@excalidraw/excalidraw";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

export function updateSceneMergingWithRemote(
  excalidrawAPI: ExcalidrawApiLike,
  remoteElements: ReadonlyArray<ExcalidrawLikeElement | unknown>
): void {
  const local = excalidrawAPI.getSceneElements() as Parameters<
    typeof reconcileElements
  >[0];
  const appState = excalidrawAPI.getAppState() as Parameters<
    typeof reconcileElements
  >[2];
  const merged = reconcileElements(
    local,
    remoteElements as Parameters<typeof reconcileElements>[1],
    appState
  );
  excalidrawAPI.updateScene({
    elements: merged as ReadonlyArray<unknown>,
  });
}
