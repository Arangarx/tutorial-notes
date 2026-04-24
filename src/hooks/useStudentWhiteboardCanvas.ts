"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import { hydrateRemoteImageFilesForScene } from "@/lib/whiteboard/hydrate-remote-files";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";

/**
 * Wires the student Excalidraw instance to the encrypted sync client:
 * remote scenes (tutor) update the local canvas; local onChange
 * broadcasts to the room. Does not touch the event log — the tutor
 * side owns recording and replay.
 *
 * `applyingRemoteRef` prevents a feedback loop: applying a remote
 * `updateScene` would otherwise fire onChange and re-broadcast the
 * same scene unnecessarily (the sync layer already drops *strict*
 * self-echoes on receive, but we still want to avoid the extra work).
 */
export function useStudentWhiteboardCanvas(
  sync: WhiteboardSyncClient | null,
  excalidrawAPI: ExcalidrawApiLike | null
) {
  const applyingRemoteRef = useRef(false);
  const loadedRemoteFileIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!sync || !excalidrawAPI) return;
    const off = sync.onRemoteScene((_peerId, elements) => {
      void (async () => {
        applyingRemoteRef.current = true;
        try {
          await hydrateRemoteImageFilesForScene(
            excalidrawAPI,
            elements,
            loadedRemoteFileIdsRef.current
          );
          excalidrawAPI.updateScene({
            elements: elements as ReadonlyArray<unknown>,
          });
        } catch (err) {
          console.warn(
            "[useStudentWhiteboardCanvas] remote scene apply failed:",
            (err as Error)?.message ?? String(err)
          );
        } finally {
          applyingRemoteRef.current = false;
        }
      })();
    });
    return off;
  }, [sync, excalidrawAPI]);

  const onCanvasChange = useCallback(
    (elements: ReadonlyArray<unknown>) => {
      if (applyingRemoteRef.current) return;
      if (!sync) return;
      try {
        sync.broadcastScene(
          elements as ReadonlyArray<ExcalidrawLikeElement>
        );
      } catch (err) {
        console.warn(
          "[useStudentWhiteboardCanvas] broadcast failed:",
          (err as Error)?.message ?? String(err)
        );
      }
    },
    [sync]
  );

  return { onCanvasChange };
}
