"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import {
  hydrateRemoteImageFilesForScene,
  type HydrateRemoteImageFilesResult,
} from "@/lib/whiteboard/hydrate-remote-files";
import { mergeScenesReconciled } from "@/lib/whiteboard/apply-reconciled-remote-scene";
import type {
  WhiteboardSyncClient,
  WhiteboardWireFollow,
  WhiteboardWirePage,
  WhiteboardWireBroadcastExtras,
} from "@/lib/whiteboard/sync-client";
import { useSyncTombstonedElementIds } from "@/hooks/useSyncTombstonedElementIds";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";

/**
 * Wires the student Excalidraw to sync with the tutor, including
 * per-board-page routing so student strokes for page 1 are not merged
 * into the tutor’s open tab on page 2.
 */
export function useStudentWhiteboardCanvas(
  sync: WhiteboardSyncClient | null,
  excalidrawAPI: ExcalidrawApiLike | null,
  onHydrateResult?: (result: HydrateRemoteImageFilesResult) => void,
  options?: {
    joinToken: string;
    followTutorView?: boolean;
    onTutorPageMeta?: (page: WhiteboardWirePage) => void;
  }
) {
  const joinToken = options?.joinToken ?? "";
  const followTutorView = options?.followTutorView === true;
  const onTutorPageMeta = options?.onTutorPageMeta;
  const { onLocalElementSnapshot, shouldDropRemoteElement } =
    useSyncTombstonedElementIds();
  const applyingRemoteRef = useRef(false);
  const lastTutorFollowRef = useRef<WhiteboardWireFollow | null>(null);
  const loadedRemoteFileIdsRef = useRef(new Set<string>());
  const giveUpFileIdsRef = useRef(new Set<string>());
  const warnDedupeRef = useRef(new Set<string>());

  const [pageList, setPageList] = useState([{ id: "p1", title: "Page 1" }]);
  const pageListRef = useRef(pageList);
  useEffect(() => {
    pageListRef.current = pageList;
  }, [pageList]);

  const [activePageId, setActivePageId] = useState("p1");
  const activePageIdRef = useRef("p1");

  const pageDataRef = useRef<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>(
    Object.create(null)
  );

  const applyTutorFollow = useCallback(
    (f: WhiteboardWireFollow) => {
      if (!excalidrawAPI) return;
      const { scrollX, scrollY, zoom } = f;
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
    },
    [excalidrawAPI]
  );

  const snapToTutorView = useCallback(() => {
    const f = lastTutorFollowRef.current;
    if (f) applyTutorFollow(f);
  }, [applyTutorFollow]);

  const getPageBroadcastExtras = useCallback((): WhiteboardWireBroadcastExtras => {
    return {
      page: {
        activePageId: activePageIdRef.current,
        pageList: pageListRef.current.map((p) => ({ id: p.id, title: p.title })),
      },
    };
  }, []);

  useEffect(() => {
    if (!sync || !excalidrawAPI) return;
    const off = sync.onRemoteScene((peerId, elements, details) => {
      if (details?.follow) {
        lastTutorFollowRef.current = details.follow;
      }
      const page = details?.page;
      const target = page?.activePageId ?? "p1";
      if (page?.pageList && page.pageList.length > 0) {
        setPageList(
          page.pageList.map((p) => ({ id: p.id, title: p.title }))
        );
      }
      const previous = activePageIdRef.current;
      if (previous !== target) {
        if (excalidrawAPI) {
          const cur = excalidrawAPI.getSceneElements() as ExcalidrawLikeElement[];
          pageDataRef.current[previous] = cur;
        }
        activePageIdRef.current = target;
        setActivePageId(target);
      }
      if (page) {
        onTutorPageMeta?.(page);
      }
      void (async () => {
        const switchedPage = previous !== target;
        applyingRemoteRef.current = true;
        try {
          const result = await hydrateRemoteImageFilesForScene(
            excalidrawAPI!,
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
          // If we just followed the tutor to another tab, `getSceneElements()`
          // is still the *previous* page until we paint — never reconcile
          // tutor's new tab against the old scene (it smears p1 + p2).
          const sameTabAsBefore = !switchedPage;
          const local: ExcalidrawLikeElement[] = sameTabAsBefore
            ? (excalidrawAPI!.getSceneElements() as ExcalidrawLikeElement[])
            : ((pageDataRef.current[target] as
                | ExcalidrawLikeElement[]
                | undefined) ?? []);
          const appState = excalidrawAPI!.getAppState() as unknown;
          const merged = await mergeScenesReconciled(
            local,
            elements,
            appState,
            { shouldDropRemoteElement }
          );
          pageDataRef.current[target] = merged;
          if (activePageIdRef.current === target) {
            excalidrawAPI!.updateScene({
              elements: merged as ReadonlyArray<unknown>,
            });
          }
          if (details?.follow && followTutorView) {
            applyTutorFollow(details.follow);
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
    applyTutorFollow,
    joinToken,
    shouldDropRemoteElement,
    sync,
    excalidrawAPI,
  ]);

  const onCanvasChange = useCallback(
    (
      elements: ReadonlyArray<unknown>,
      _appState?: unknown,
      _files?: Readonly<Record<string, unknown>>
    ) => {
      if (applyingRemoteRef.current) return;
      pageDataRef.current[activePageIdRef.current] = elements as ExcalidrawLikeElement[];
      onLocalElementSnapshot(elements);
      if (!sync) return;
      try {
        sync.broadcastScene(
          elements as ReadonlyArray<ExcalidrawLikeElement>,
          getPageBroadcastExtras()
        );
      } catch (err) {
        console.warn(
          "[useStudentWhiteboardCanvas] broadcast failed:",
          (err as Error)?.message ?? String(err)
        );
      }
    },
    [onLocalElementSnapshot, sync, getPageBroadcastExtras]
  );

  return {
    onCanvasChange,
    snapToTutorView,
    getPageBroadcastExtras,
    pageList,
    activePageId,
  };
}
