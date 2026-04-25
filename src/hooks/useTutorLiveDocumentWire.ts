"use client";

import { useCallback, useRef } from "react";
import type {
  WhiteboardSyncClient,
  WhiteboardWireFollow,
  WhiteboardWirePage,
} from "@/lib/whiteboard/sync-client";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

const THROTTLE_MS = 50;

/**
 * Tutor live sync over **v3** wire: one throttled, atomic **full document**
 * (`pages` for every tab + `page` + `follow` + `rev`). This is separate from
 * {@link useWhiteboardRecorder} so recording diffs and network payload shape
 * stay decoupled.
 */
export function useTutorLiveDocumentWire(options: {
  /** False when `sync` is null or `WHITEBOARD_SYNC_URL` unset. */
  enabled: boolean;
  sync: WhiteboardSyncClient | null;
  getPagesSnapshot: () => Readonly<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>;
  getPageListAndActive: () => {
    pageList: ReadonlyArray<{ id: string; title: string }>;
    activePageId: string;
  };
  getFollow: () => WhiteboardWireFollow;
}) {
  const { enabled, sync, getPagesSnapshot, getPageListAndActive, getFollow } = options;
  const revRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitDocument = useCallback(() => {
    if (!enabled || !sync) return;
    revRef.current += 1;
    const { pageList, activePageId } = getPageListAndActive();
    const raw = getPagesSnapshot();
    const pages: Record<string, ExcalidrawLikeElement[]> = {};
    for (const [k, els] of Object.entries(raw)) {
      pages[k] = (els as ReadonlyArray<ExcalidrawLikeElement>).map(
        (e) => ({ ...e }) as ExcalidrawLikeElement
      );
    }
    const page: WhiteboardWirePage = {
      activePageId,
      pageList: pageList.map((p) => ({ id: p.id, title: p.title })),
    };
    sync.broadcastDocument({
      rev: revRef.current,
      pages,
      page,
      follow: getFollow(),
    });
  }, [enabled, sync, getPagesSnapshot, getPageListAndActive, getFollow]);

  const scheduleDocumentBroadcast = useCallback(() => {
    if (!enabled || !sync) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      emitDocument();
    }, THROTTLE_MS);
  }, [emitDocument, enabled, sync]);

  const flushDocumentBroadcastNow = useCallback(() => {
    if (!enabled || !sync) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    emitDocument();
    sync.flushPendingBroadcast();
  }, [emitDocument, enabled, sync]);

  return { scheduleDocumentBroadcast, flushDocumentBroadcastNow, revRef };
}
