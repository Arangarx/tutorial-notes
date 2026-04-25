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
  WhiteboardWireRemoteDetails,
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
  /**
   * Monotonic tutor `rev` (same socket session). We reset to 0 on our reconnect
   * and when the tutor re-appears in the room so a tutor page reload
   * (rev counter restarts) is not mis-read as a stale, dropped packet.
   */
  const lastTutorV3RevRef = useRef(0);
  const [tutorStreamReady, setTutorStreamReady] = useState(false);
  const prevOtherPeersForRevResetRef = useRef(-1);

  /** Live canvas — may be null for several hundred ms while Excalidraw loads. */
  const excalidrawApiRef = useRef<ExcalidrawApiLike | null>(null);
  useEffect(() => {
    excalidrawApiRef.current = excalidrawAPI;
  }, [excalidrawAPI]);

  /**
   * Tutor `new-user` can re-broadcast before we subscribe if the listener
   * was gated on `excalidrawAPI`. Buffer the latest wire payload and apply
   * once the canvas API exists.
   */
  const pendingV3Ref = useRef<{
    rev: number;
    details: WhiteboardWireRemoteDetails;
  } | null>(null);
  const pendingV2Ref = useRef<{
    elements: ReadonlyArray<ExcalidrawLikeElement>;
    details?: WhiteboardWireRemoteDetails;
  } | null>(null);

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

  const runV3Apply = useCallback(
    async (api: ExcalidrawApiLike, details: WhiteboardWireRemoteDetails) => {
      const docV3 = details.document;
      const page = details.page;
      if (!docV3 || !page) return;

      if (details.follow) {
        lastTutorFollowRef.current = details.follow;
      }
      if (page.pageList && page.pageList.length > 0) {
        setPageList(page.pageList.map((p) => ({ id: p.id, title: p.title })));
      }
      const followTarget = page.activePageId;
      const previous = activePageIdRef.current;
      if (previous !== followTarget) {
        if (pageDataRef.current[previous] === undefined) {
          pageDataRef.current[previous] = api.getSceneElements() as ExcalidrawLikeElement[];
        }
        activePageIdRef.current = followTarget;
        setActivePageId(followTarget);
      }
      onTutorPageMeta?.(page);

      applyingRemoteRef.current = true;
      try {
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
        if (details.follow && followTutorView) {
          const prevState = api.getAppState() as Record<string, unknown>;
          const a = api as ExcalidrawApiLike & {
            updateScene: (s: { appState?: unknown; elements?: unknown }) => void;
          };
          a.updateScene({
            appState: {
              ...prevState,
              scrollX: details.follow!.scrollX,
              scrollY: details.follow!.scrollY,
              zoom: { value: details.follow!.zoom },
            },
          });
        }
        setTutorStreamReady(true);
      } catch (err) {
        console.warn(
          "[useStudentWhiteboardCanvas] v3 document apply failed:",
          (err as Error)?.message ?? String(err)
        );
      } finally {
        applyingRemoteRef.current = false;
      }
    },
    [
      followTutorView,
      joinToken,
      onHydrateResult,
      onTutorPageMeta,
      shouldDropRemoteElement,
    ]
  );

  const runV2Apply = useCallback(
    async (
      api: ExcalidrawApiLike,
      elements: ReadonlyArray<ExcalidrawLikeElement>,
      details?: WhiteboardWireRemoteDetails
    ) => {
      if (details?.follow) {
        lastTutorFollowRef.current = details.follow;
      }
      const page = details?.page;
      const followTarget = page?.activePageId ?? "p1";
      const mergeTarget = details?.scenePageId ?? followTarget;
      if (page?.pageList && page.pageList.length > 0) {
        setPageList(page.pageList.map((p) => ({ id: p.id, title: p.title })));
      }
      const previous = activePageIdRef.current;
      if (previous !== followTarget) {
        if (pageDataRef.current[previous] === undefined) {
          pageDataRef.current[previous] = api.getSceneElements() as ExcalidrawLikeElement[];
        }
        activePageIdRef.current = followTarget;
        setActivePageId(followTarget);
      }
      if (page) {
        onTutorPageMeta?.(page);
      }
      applyingRemoteRef.current = true;
      try {
        const result = await hydrateRemoteImageFilesForScene(
          api,
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
          ? (api.getSceneElements() as ExcalidrawLikeElement[])
          : ((pageDataRef.current[mergeTarget] as
              | ExcalidrawLikeElement[]
              | undefined) ?? []);
        const appState = api.getAppState() as unknown;
        const merged = await mergeScenesReconciled(
          local,
          elements,
          appState,
          { shouldDropRemoteElement }
        );
        pageDataRef.current[mergeTarget] = merged;
        if (activePageIdRef.current === mergeTarget) {
          api.updateScene({ elements: merged as ReadonlyArray<unknown> });
        }
        if (details?.follow && followTutorView) {
          const prevState = api.getAppState() as Record<string, unknown>;
          const a = api as ExcalidrawApiLike & {
            updateScene: (s: { appState?: unknown; elements?: unknown }) => void;
          };
          a.updateScene({
            appState: {
              ...prevState,
              scrollX: details.follow.scrollX,
              scrollY: details.follow.scrollY,
              zoom: { value: details.follow.zoom },
            },
          });
        }
        setTutorStreamReady(true);
      } catch (err) {
        console.warn(
          "[useStudentWhiteboardCanvas] remote scene apply failed:",
          (err as Error)?.message ?? String(err)
        );
      } finally {
        applyingRemoteRef.current = false;
      }
    },
    [followTutorView, joinToken, onHydrateResult, onTutorPageMeta, shouldDropRemoteElement]
  );

  useEffect(() => {
    if (!excalidrawAPI) return;
    const p3 = pendingV3Ref.current;
    if (p3) {
      pendingV3Ref.current = null;
      lastTutorV3RevRef.current = p3.rev;
      void runV3Apply(excalidrawAPI, p3.details);
    }
    const p2 = pendingV2Ref.current;
    if (p2) {
      pendingV2Ref.current = null;
      void runV2Apply(excalidrawAPI, p2.elements, p2.details);
    }
  }, [excalidrawAPI, runV3Apply, runV2Apply]);

  useEffect(() => {
    if (!sync) return;
    if (
      typeof sync.onConnect !== "function" ||
      typeof sync.onPeerCountChange !== "function"
    ) {
      return;
    }
    lastTutorV3RevRef.current = 0;
    const offConnect = sync.onConnect(() => {
      lastTutorV3RevRef.current = 0;
    });
    const offPeer = sync.onPeerCountChange((n) => {
      const was = prevOtherPeersForRevResetRef.current;
      if (n >= 1 && was <= 0) {
        lastTutorV3RevRef.current = 0;
      }
      prevOtherPeersForRevResetRef.current = n;
    });
    return () => {
      offConnect();
      offPeer();
    };
  }, [sync]);

  useEffect(() => {
    if (!sync) return;
    const off = sync.onRemoteScene((peerId, elements, details) => {
      const docV3 = details?.document;
      if (docV3) {
        const r = docV3.rev;
        const last = lastTutorV3RevRef.current;
        if (r === last) {
          return;
        }
        if (r < last) {
          if (last - r <= 2) {
            return;
          }
        }
        const apiNow = excalidrawApiRef.current;
        if (!apiNow) {
          const prevB = pendingV3Ref.current;
          if (prevB) {
            if (r === prevB.rev) return;
            if (r < prevB.rev && prevB.rev - r <= 2) {
              return;
            }
          }
          pendingV3Ref.current = { rev: r, details: details! };
          return;
        }
        lastTutorV3RevRef.current = r;
        void runV3Apply(apiNow, details!);
        return;
      }
      if (!excalidrawApiRef.current) {
        pendingV2Ref.current = {
          elements: elements as ExcalidrawLikeElement[],
          details,
        };
        return;
      }
      void runV2Apply(
        excalidrawApiRef.current,
        elements as ReadonlyArray<ExcalidrawLikeElement>,
        details
      );
    });
    return off;
  }, [runV2Apply, runV3Apply, sync]);

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
    /** At least one tutor v2 or v3 scene was applied; false until first packet. */
    tutorStreamReady,
  };
}
