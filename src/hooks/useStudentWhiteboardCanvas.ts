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
  /** Drop stale reordered v3 document packets. */
  const lastTutorV3RevRef = useRef(0);

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
    const id = activePageIdRef.current;
    return {
      page: {
        activePageId: id,
        pageList: pageListRef.current.map((p) => ({ id: p.id, title: p.title })),
      },
      scenePageId: id,
    };
  }, []);

  useEffect(() => {
    if (!sync || !excalidrawAPI) return;
    const off = sync.onRemoteScene((peerId, elements, details) => {
      const docV3 = details?.document;
      if (docV3) {
        if (docV3.rev <= lastTutorV3RevRef.current) {
          return;
        }
        lastTutorV3RevRef.current = docV3.rev;
        if (details?.follow) {
          lastTutorFollowRef.current = details.follow;
        }
        const page = details?.page;
        if (!page) return;
        if (page.pageList && page.pageList.length > 0) {
          setPageList(page.pageList.map((p) => ({ id: p.id, title: p.title })));
        }
        const followTarget = page.activePageId;
        const previous = activePageIdRef.current;
        if (previous !== followTarget) {
          if (pageDataRef.current[previous] === undefined) {
            pageDataRef.current[previous] = excalidrawAPI.getSceneElements() as ExcalidrawLikeElement[];
          }
          activePageIdRef.current = followTarget;
          setActivePageId(followTarget);
        }
        onTutorPageMeta?.(page);
        void (async () => {
          applyingRemoteRef.current = true;
          try {
            const api = excalidrawAPI;
            const appState = api.getAppState() as unknown;
            const pageIds = page.pageList.map((p) => p.id);
            for (const pageId of pageIds) {
              const base = (docV3.pages[pageId] ?? []) as ReadonlyArray<ExcalidrawLikeElement>;
              const remoteCopy = base.map((e) => ({ ...e }) as ExcalidrawLikeElement);
              const hydrate = await hydrateRemoteImageFilesForScene(
                api,
                remoteCopy,
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
              onHydrateResult?.(hydrate);
              const local: ExcalidrawLikeElement[] =
                (pageDataRef.current[pageId] as ExcalidrawLikeElement[] | undefined) ?? [];
              const merged = await mergeScenesReconciled(
                local,
                remoteCopy,
                appState,
                { shouldDropRemoteElement }
              );
              pageDataRef.current[pageId] = merged;
            }
            const act = activePageIdRef.current;
            const toShow = pageDataRef.current[act];
            if (toShow) {
              api.updateScene({ elements: toShow as ReadonlyArray<unknown> });
            }
            if (details?.follow && followTutorView) {
              applyTutorFollow(details.follow);
            }
          } catch (err) {
            console.warn(
              "[useStudentWhiteboardCanvas] v3 document apply failed:",
              (err as Error)?.message ?? String(err)
            );
          } finally {
            applyingRemoteRef.current = false;
          }
        })();
        return;
      }
      if (details?.follow) {
        lastTutorFollowRef.current = details.follow;
      }
      const page = details?.page;
      const followTarget = page?.activePageId ?? "p1";
      const mergeTarget = details?.scenePageId ?? followTarget;
      if (page?.pageList && page.pageList.length > 0) {
        setPageList(
          page.pageList.map((p) => ({ id: p.id, title: p.title }))
        );
      }
      const previous = activePageIdRef.current;
      if (previous !== followTarget) {
        if (excalidrawAPI) {
          if (pageDataRef.current[previous] === undefined) {
            pageDataRef.current[previous] = excalidrawAPI.getSceneElements() as ExcalidrawLikeElement[];
          }
        }
        activePageIdRef.current = followTarget;
        setActivePageId(followTarget);
      }
      if (page) {
        onTutorPageMeta?.(page);
      }
      void (async () => {
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
          const studentSeesMergePage = activePageIdRef.current === mergeTarget;
          const local: ExcalidrawLikeElement[] = studentSeesMergePage
            ? (excalidrawAPI!.getSceneElements() as ExcalidrawLikeElement[])
            : ((pageDataRef.current[mergeTarget] as
                | ExcalidrawLikeElement[]
                | undefined) ?? []);
          const appState = excalidrawAPI!.getAppState() as unknown;
          const merged = await mergeScenesReconciled(
            local,
            elements,
            appState,
            { shouldDropRemoteElement }
          );
          pageDataRef.current[mergeTarget] = merged;
          if (activePageIdRef.current === mergeTarget) {
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
