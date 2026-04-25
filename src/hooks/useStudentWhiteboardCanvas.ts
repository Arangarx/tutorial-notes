"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import {
  hydrateRemoteImageFilesForScene,
  type HydrateRemoteImageFilesResult,
} from "@/lib/whiteboard/hydrate-remote-files";
import type {
  WhiteboardSyncClient,
  WhiteboardWirePage,
} from "@/lib/whiteboard/sync-client";
import { updateSceneMergingWithRemote } from "@/lib/whiteboard/apply-reconciled-remote-scene";
import { useSyncTombstonedElementIds } from "@/hooks/useSyncTombstonedElementIds";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";

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
  excalidrawAPI: ExcalidrawApiLike | null,
  onHydrateResult?: (result: HydrateRemoteImageFilesResult) => void,
  options?: {
    joinToken: string;
    /** false = let student pan/zoom independently (default: follow tutor). */
    followTutorView?: boolean;
    onTutorPageMeta?: (page: WhiteboardWirePage) => void;
  }
) {
  const joinToken = options?.joinToken ?? "";
  const followTutorView = options?.followTutorView !== false;
  const onTutorPageMeta = options?.onTutorPageMeta;
  const { onLocalElementSnapshot, shouldDropRemoteElement } =
    useSyncTombstonedElementIds();
  const applyingRemoteRef = useRef(false);
  const loadedRemoteFileIdsRef = useRef(new Set<string>());
  const giveUpFileIdsRef = useRef(new Set<string>());
  const warnDedupeRef = useRef(new Set<string>());

  useEffect(() => {
    if (!sync || !excalidrawAPI) return;
    const off = sync.onRemoteScene((peerId, elements, details) => {
      void (async () => {
        applyingRemoteRef.current = true;
        try {
          const result = await hydrateRemoteImageFilesForScene(
            excalidrawAPI,
            elements,
            loadedRemoteFileIdsRef.current,
            {
              logContext: "student",
              giveUpFileIds: giveUpFileIdsRef.current,
              warnDedupe: warnDedupeRef.current,
              resolveReadUrl:
                joinToken.length > 0
                  ? (u) =>
                      resolveWhiteboardAssetReadUrl(u, {
                        kind: "student",
                        joinToken,
                      })
                  : undefined,
            }
          );
          onHydrateResult?.(result);
          await updateSceneMergingWithRemote(excalidrawAPI, elements, {
            shouldDropRemoteElement,
          });
          if (details?.page) {
            onTutorPageMeta?.(details.page);
          }
          if (details?.follow && followTutorView) {
            const { scrollX, scrollY, zoom } = details.follow;
            applyingRemoteRef.current = true;
            try {
              const prev = excalidrawAPI.getAppState() as Record<string, unknown>;
              const api = excalidrawAPI as ExcalidrawApiLike & {
                updateScene: (s: { appState?: unknown; elements?: unknown }) => void;
              };
              api.updateScene({
                appState: {
                  ...prev,
                  scrollX,
                  scrollY,
                  zoom: { value: zoom },
                },
              });
            } finally {
              applyingRemoteRef.current = false;
            }
          }
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
  }, [
    onHydrateResult,
    onTutorPageMeta,
    followTutorView,
    joinToken,
    shouldDropRemoteElement,
    sync,
    excalidrawAPI,
  ]);

  const onCanvasChange = useCallback(
    (elements: ReadonlyArray<unknown>) => {
      if (applyingRemoteRef.current) return;
      onLocalElementSnapshot(elements);
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
    [onLocalElementSnapshot, sync]
  );

  return { onCanvasChange };
}
