"use client";

/**
 * Tutor-side live whiteboard orchestrator.
 *
 * Composes (in dependency order):
 *
 *   1. URL-fragment encryption key — generated on first mount, parked
 *      in `window.location.hash` so refresh keeps the same key. The
 *      server NEVER sees this. Same model the student page uses.
 *
 *   2. Live-sync client — `createWhiteboardSyncClient` against
 *      `WHITEBOARD_SYNC_URL`. Disabled gracefully if the env var is
 *      unset (recording still works in tutor-solo mode).
 *
 *   3. `useWhiteboardRecorder` — produces the canonical event log,
 *      checkpoints to IndexedDB, surfaces resume prompts.
 *
 *   4. Lazy-loaded Excalidraw — `next/dynamic` with `ssr: false`
 *      so the >1MB Excalidraw bundle never lands on initial HTML.
 *
 *   5. End-session flow — flush final events.json, upload to Blob,
 *      call `endWhiteboardSession` (sets endedAt + revokes tokens),
 *      then redirect to the read-only review surface.
 *
 * What's intentionally NOT here yet:
 *
 *   - PDF/image upload toolbar (separate todo `phase1-pdf-upload`).
 *   - Math equation popover (`phase1-math-equations`).
 *   - Desmos embed (`phase1-graphing`).
 *   - Audio recorder mic meter — wired in via `useAudioRecorder` but
 *     the visual meter component re-uses the existing one from
 *     `RecordView`. For Phase 1 skeleton we use the simpler "elapsed
 *     seconds" display; the full mic meter UI lift is a follow-up.
 *
 * Failure-mode contract: this component NEVER lets a hook callback
 * throw into the React tree. Every async boundary maps errors to
 * banner state.
 */

import { copyTextToClipboard } from "@/lib/copy-text-to-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowScrollToTopOnMount } from "@/hooks/useWindowScrollToTopOnMount";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";
import { useSyncTombstonedElementIds } from "@/hooks/useSyncTombstonedElementIds";
import { useRouter } from "next/navigation";
import {
  createWhiteboardSyncClient,
  generateEncryptionKeyBase64Url,
  type WhiteboardSyncClient,
} from "@/lib/whiteboard/sync-client";
import {
  ACTIVE_PING_STALE_MS,
  computeDisplayActiveMs,
} from "@/lib/whiteboard/active-time";
import { deriveRecordingPresence } from "@/lib/whiteboard/recording-presence";
import { useWhiteboardRecorder } from "@/hooks/useWhiteboardRecorder";
import { uploadWhiteboardEvents } from "@/lib/whiteboard/upload";
import {
  endWhiteboardSession,
  issueJoinToken,
  revokeJoinTokensForSession,
} from "@/app/admin/students/[id]/whiteboard/actions";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import { PdfImageUploadButton } from "@/components/whiteboard/PdfImageUploadButton";
import { MathInsertButton } from "@/components/whiteboard/MathInsertButton";
import { DesmosInsertButton } from "@/components/whiteboard/DesmosInsertButton";
import { UndoRedoButtons } from "@/components/whiteboard/UndoRedoButtons";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { type ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import {
  ensureNativeImageAssetUrlsForSync,
  type BinaryFileFromExcalidraw,
} from "@/lib/whiteboard/ensure-native-image-asset-urls-for-sync";
import { hydrateRemoteImageFilesForScene } from "@/lib/whiteboard/hydrate-remote-files";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";
import type { WhiteboardWireBroadcastExtras } from "@/lib/whiteboard/sync-client";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";
import { updateSceneMergingWithRemote } from "@/lib/whiteboard/apply-reconciled-remote-scene";
import { toExcalidraw } from "@/lib/whiteboard/excalidraw-adapter";
import {
  clearSessionSceneDraft,
  loadSessionSceneDraft,
  saveSessionSceneDraft,
} from "@/lib/whiteboard/session-scene-draft";

type Props = {
  whiteboardSessionId: string;
  studentId: string;
  studentName: string;
  adminUserId: string;
  startedAtIso: string;
  bothConnectedAtIso: string | null;
  /** Server-truth accumulated billable ms at SSR time. */
  initialActiveMs: number;
  /** Server-stamped wall-clock of the most recent positive heartbeat (ISO), or null if paused. */
  initialLastActiveAtIso: string | null;
  syncUrl: string | null;
  /**
   * Per-student "Start whiteboard recording on by default" preference.
   * Sarah's pilot ask (Apr 2026): the workspace toggle should ship in
   * the right initial position for each student so she's not unticking
   * Start every time for students who declined recording. The tutor
   * can still flip mid-session — this is the initial state only.
   */
  initialUserWantsRecording: boolean;
};

function CanvasPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="card"
      style={{
        minHeight: 540,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="muted">{label}</div>
    </div>
  );
}

/**
 * Read or mint the AES-GCM encryption key in `window.location.hash`.
 *
 * The key never leaves the browser. We park it in the URL hash so a
 * refresh keeps the same key — without that, refresh would lose live
 * collab continuity (the student would be holding an outdated key).
 *
 * Returns the key string or null until we've finished the mount-time
 * client-only code path (server render + first hydration tick).
 */
function useEncryptionKeyInHash(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const existing = params.get("k");
    if (existing && existing.length >= 16) {
      setKey(existing);
      return;
    }
    const fresh = generateEncryptionKeyBase64Url();
    params.set("k", fresh);
    // Use replaceState so we don't push a history entry for every key
    // mint and so the back button still goes to the student detail page.
    const newHash = `#${params.toString()}`;
    window.history.replaceState(null, "", newHash);
    setKey(fresh);
  }, []);
  return key;
}

/**
 * Audio-clock surrogate. The plan calls for `MediaRecorder.getElapsedAudioMs()`
 * (blocker #2) — the audio recorder doesn't expose that yet (tracked
 * in `docs/BACKLOG.md` "Reliability gaps"). Until it lands, we drive
 * `getAudioMs` off `performance.now()` deltas, accumulating across
 * pauses. ms precision; doesn't account for iOS background-tab clock
 * throttling (the BACKLOG item covers that follow-up).
 */
function useAudioMsClock(active: boolean): () => number {
  const startedAtRef = useRef<number | null>(null);
  const accruedMsRef = useRef(0);
  useEffect(() => {
    if (active) {
      startedAtRef.current = performance.now();
    } else if (startedAtRef.current !== null) {
      accruedMsRef.current += performance.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
  }, [active]);
  return useCallback(() => {
    if (startedAtRef.current === null) return Math.floor(accruedMsRef.current);
    return Math.floor(
      accruedMsRef.current + (performance.now() - startedAtRef.current)
    );
  }, []);
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function WhiteboardWorkspaceClient({
  whiteboardSessionId,
  studentId,
  studentName,
  adminUserId,
  startedAtIso,
  bothConnectedAtIso,
  initialActiveMs,
  initialLastActiveAtIso,
  syncUrl,
  initialUserWantsRecording,
}: Props) {
  const router = useRouter();
  const excalidrawTheme = useExcalidrawThemeFromSystem();
  const { onLocalElementSnapshot, shouldDropRemoteElement } =
    useSyncTombstonedElementIds();

  useWindowScrollToTopOnMount();

  // ---------------------------------------------------------------
  // Encryption key + sync client lifecycle
  // ---------------------------------------------------------------

  const encryptionKey = useEncryptionKeyInHash();
  const syncClientRef = useRef<WhiteboardSyncClient | null>(null);
  const [syncReady, setSyncReady] = useState(false);

  // Captured from Excalidraw's `excalidrawAPI` callback — the toolbar
  // buttons (Insert PDF/image, etc.) call into this for scene mutation.
  // Stored in state (not just a ref) so children re-render when it
  // becomes available.
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawApiLike | null>(
    null
  );
  const excalidrawAPIRef = useRef<ExcalidrawApiLike | null>(null);
  const applyingRemoteToCanvasRef = useRef(false);
  /** Per-tab sessionStorage draft — see `session-scene-draft.ts`. */
  const sceneDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedSessionDraftRef = useRef(false);

  useEffect(() => {
    return () => {
      if (sceneDraftTimerRef.current !== null) {
        clearTimeout(sceneDraftTimerRef.current);
        sceneDraftTimerRef.current = null;
      }
    };
  }, []);
  const loadedRemoteFileIdsForTutorRef = useRef(new Set<string>());
  const giveUpTutorFileIdsRef = useRef(new Set<string>());
  const warnDedupeTutorRef = useRef(new Set<string>());
  /** Native Excalidraw image inserts: cache fileId → blob URL after upload for sync + student hydrate. */
  const tutorNativeImageFileIdToAssetUrlRef = useRef(new Map<string, string>());
  const tutorNativeImageUploadInFlightRef = useRef(new Set<string>());

  const [pageList, setPageList] = useState(() => [
    { id: "p1", title: "Page 1" },
  ]);
  const [activePageId, setActivePageId] = useState("p1");
  const activePageIdRef = useRef("p1");
  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);
  /** In-memory per-tab scene (Excalidraw only shows one at a time). */
  const pageDataRef = useRef<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>(
    Object.create(null)
  );

  const [peerImageMaterialNotice, setPeerImageMaterialNotice] = useState<
    "none" | "load" | "missing"
  >("none");

  const applyRemoteToCanvas = useCallback(
    async (elements: ReadonlyArray<ExcalidrawLikeElement>) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      const result = await hydrateRemoteImageFilesForScene(
        api,
        elements,
        loadedRemoteFileIdsForTutorRef.current,
        {
          logContext: "tutor",
          giveUpFileIds: giveUpTutorFileIdsRef.current,
          warnDedupe: warnDedupeTutorRef.current,
          resolveReadUrl: (u) =>
            resolveWhiteboardAssetReadUrl(u, {
              kind: "tutor",
              whiteboardSessionId,
            }),
        }
      );
      if (result.fetchFailed.length > 0) {
        setPeerImageMaterialNotice("load");
      } else if (result.missingAssetUrlFileIds.length > 0) {
        setPeerImageMaterialNotice((prev) =>
          prev === "load" ? "load" : "missing"
        );
      }
      applyingRemoteToCanvasRef.current = true;
      try {
        await updateSceneMergingWithRemote(api, elements, {
          shouldDropRemoteElement,
        });
      } finally {
        applyingRemoteToCanvasRef.current = false;
      }
    },
    [shouldDropRemoteElement, whiteboardSessionId]
  );

  useEffect(() => {
    if (!syncUrl || !encryptionKey) return;
    const client = createWhiteboardSyncClient({
      url: syncUrl,
      roomId: whiteboardSessionId,
      encryptionKeyBase64Url: encryptionKey,
      role: "tutor",
    });
    syncClientRef.current = client;
    setSyncReady(true);
    return () => {
      client.disconnect();
      syncClientRef.current = null;
      setSyncReady(false);
    };
  }, [encryptionKey, syncUrl, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // Recording lifecycle (audio + whiteboard composed)
  // ---------------------------------------------------------------
  //
  // For the Phase 1 skeleton the workspace's "Start recording" button
  // gates BOTH the audio recorder and the whiteboard recorder via a
  // single `recordingActive` flag. This avoids two separate Start
  // buttons that could drift out of sync (e.g., audio capturing but
  // whiteboard event log empty). The audio recorder integration lift
  // (full mic meter, gain slider, device picker) is deferred — for
  // now we use a minimal "Start / Stop" pair and treat audio capture
  // as a follow-up integration. The recorder hook is fully working;
  // it just isn't visualized in the toolbar yet.
  //
  // What's wired today:
  //   - `recordingActive` → useWhiteboardRecorder gate ✔
  //   - `getAudioMs`      → performance.now()-based surrogate ✔
  //   - useAudioRecorder  → NOT mounted yet (separate integration)
  //
  // The whiteboard event log produced is fully valid; it just won't
  // align to an audio file until we land the audio integration. That
  // means replay shows strokes correctly (with the t timeline) but
  // there's no audio to play alongside.

  // `userWantsRecording` is the tutor's explicit intent (Start / Pause
  // button). The actual `recordingActive` we hand to the recorder hook
  // is the AND of intent + presence so the recorder pauses itself
  // when the student drops — see `deriveRecordingPresence` below.
  // Sarah's pilot ask (Apr 2026): "I don't think the recording needs
  // to keep going if the student isn't connected."
  //
  // The initial value comes from `Student.recordingDefaultEnabled`
  // (also Sarah's ask): students who declined recording ship the
  // toggle off so the tutor doesn't have to untick Start every time.
  // The tutor can still flip mid-session.
  const [userWantsRecording, setUserWantsRecording] = useState(
    initialUserWantsRecording
  );

  const sync = syncReady ? syncClientRef.current : null;

  // We need `bothPresent` to drive both the active-ping heartbeat AND
  // the recording gate, but `bothPresent` itself depends on
  // `recorder.syncConnected` (set by the hook). To break the cycle we
  // compute `bothPresent` from a peerCount state + sync-client
  // connection state below, then re-derive recording presence, then
  // pass the gated `recordingActive` into the recorder. The recorder
  // hook treats the resulting transitions as ordinary pause/resume —
  // it already emits the right event-log markers (`pause`, `resume`,
  // `sync-disconnect`, `sync-reconnect`) for replay attribution.

  // Peer count (= number of OTHER peers; >=1 means a student joined).
  const [peerCount, setPeerCount] = useState(0);

  useEffect(() => {
    if (!sync) return;
    const off = sync.onPeerCountChange((count) => {
      setPeerCount(count);
    });
    return off;
  }, [sync]);

  // Tutor's own socket state. We poll the sync client directly here
  // rather than via `recorder.syncConnected` because the recorder
  // hook receives the gated `recordingActive` and we'd create a
  // dependency cycle. The polling cost is trivial (1 boolean read /s).
  const [tutorSyncConnected, setTutorSyncConnected] = useState(false);

  useEffect(() => {
    if (!sync) {
      setTutorSyncConnected(false);
      return;
    }
    const off1 = sync.onConnect(() => setTutorSyncConnected(true));
    const off2 = sync.onDisconnect(() => setTutorSyncConnected(false));
    setTutorSyncConnected(sync.isConnected());
    return () => {
      off1();
      off2();
    };
  }, [sync]);

  const bothPresent = tutorSyncConnected && peerCount >= 1;

  // Sticky latch: once both parties have ever met this session, we
  // know future "auto-pauses" are reconnect waits, not first-join
  // waits. Lets the banner say "we'll resume automatically" instead
  // of "we'll start when they join" after the first meet.
  const everBothPresentRef = useRef(false);
  if (bothPresent && !everBothPresentRef.current) {
    everBothPresentRef.current = true;
  }

  const presence = deriveRecordingPresence({
    userWantsRecording,
    bothPresent,
    syncEnabled: !!syncUrl,
    everBothPresent: everBothPresentRef.current,
  });
  const recordingActive = presence.recordingActive;

  const getAudioMs = useAudioMsClock(recordingActive);

  const getWireBroadcastExtras = useCallback(():
    | WhiteboardWireBroadcastExtras
    | null => {
    if (!syncUrl) return null;
    const api = excalidrawAPIRef.current;
    if (!api) return null;
    const st = api.getAppState() as {
      scrollX: number;
      scrollY: number;
      zoom: { value: number };
    };
    return {
      follow: {
        scrollX: st.scrollX,
        scrollY: st.scrollY,
        zoom: st.zoom.value,
      },
      page: {
        activePageId,
        pageList: pageList.map((p) => ({ id: p.id, title: p.title })),
      },
    };
  }, [activePageId, pageList, syncUrl]);

  const selectTutorPage = useCallback(
    (nextId: string) => {
      if (nextId === activePageId) return;
      const api = excalidrawAPIRef.current;
      if (!api) {
        setActivePageId(nextId);
        return;
      }
      const current = api.getSceneElements() as ReadonlyArray<ExcalidrawLikeElement>;
      pageDataRef.current[activePageId] = current;
      const next = (pageDataRef.current[nextId] as ReadonlyArray<ExcalidrawLikeElement> | undefined) ?? [];
      applyingRemoteToCanvasRef.current = true;
      try {
        api.updateScene({ elements: next as ReadonlyArray<unknown> });
      } finally {
        applyingRemoteToCanvasRef.current = false;
      }
      setActivePageId(nextId);
    },
    [activePageId]
  );

  const addTutorPage = useCallback(() => {
    const api = excalidrawAPIRef.current;
    if (api) {
      const current = api.getSceneElements() as ReadonlyArray<ExcalidrawLikeElement>;
      pageDataRef.current[activePageId] = current;
    }
    const n = pageList.length + 1;
    const newId = `p${Date.now()}`;
    setPageList((pl) => [...pl, { id: newId, title: `Page ${n}` }]);
    pageDataRef.current[newId] = [];
    applyingRemoteToCanvasRef.current = true;
    try {
      api?.updateScene({ elements: [] });
    } finally {
      applyingRemoteToCanvasRef.current = false;
    }
    setActivePageId(newId);
  }, [activePageId, pageList.length]);

  const recorder = useWhiteboardRecorder({
    whiteboardSessionId,
    adminUserId,
    studentId,
    startedAtIso,
    getAudioMs,
    recordingActive,
    sync,
    applyRemoteToCanvas,
    getWireBroadcastExtras: syncUrl ? getWireBroadcastExtras : undefined,
  });

  // ---------------------------------------------------------------
  // Live timer — Wyzant-style "both connected" billable clock
  // ---------------------------------------------------------------
  //
  // Sarah's expectation (Apr 2026): the timer should PAUSE whenever
  // the student isn't in the room. Wall-clock from a single anchor
  // doesn't satisfy that — a student dropping off mid-session would
  // keep the clock running.
  //
  // Implementation:
  //   1. Watch sync-client peer count + tutor's own connection state
  //      to decide "are both parties present right now?".
  //   2. While both-present, POST a heartbeat to /active-ping every
  //      ~10s. The server adds (now - lastActiveAt) to the persisted
  //      `activeMs` (with a staleness cap so a closed tab doesn't
  //      retroactively bill).
  //   3. On flip to NOT-present, fire a `false` ping immediately.
  //   4. On window unload, fire a `false` beacon so the segment
  //      closes even if the tutor closes the tab abruptly.
  //   5. Display `activeMs (server) + (now - lastActiveAt)` while
  //      we're locally active so the pill keeps ticking between
  //      heartbeats; otherwise display the server value verbatim.
  //   6. On mount and every ~30s, GET /timer-anchor to stay in sync
  //      with cross-device tutor refreshes.
  //
  // Legacy `bothConnectedAt` is still stamped (by the student page on
  // first open + by the active-ping route on first positive ping)
  // so the read-only review surface keeps showing "first overlap
  // at HH:MM" — but the displayed live timer no longer reads from it.
  void bothConnectedAtIso; // kept on the prop boundary for SSR; not used here

  // Server-truth state, refreshed by the polling effect below.
  const [serverActiveMs, setServerActiveMs] = useState<number>(initialActiveMs);
  const [serverLastActiveAtMs, setServerLastActiveAtMs] = useState<
    number | null
  >(initialLastActiveAtIso ? new Date(initialLastActiveAtIso).getTime() : null);

  // `bothPresent` and `peerCount` are computed above so the recording
  // gate (`deriveRecordingPresence`) can read them. They drive both
  // the heartbeat below and the "Student connected" pill.

  // POST a single ping. Returns the server's new state on success.
  const pingActive = useCallback(
    async (active: boolean): Promise<void> => {
      try {
        const res = await fetch(
          `/api/whiteboard/${whiteboardSessionId}/active-ping`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active }),
            keepalive: true, // best-effort persist on tab close
          }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          activeMs: number;
          lastActiveAt: string | null;
        };
        setServerActiveMs(data.activeMs);
        setServerLastActiveAtMs(
          data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : null
        );
      } catch {
        // Network hiccup — the next heartbeat will retry. We never
        // surface ping failures to the UI; they're an internal
        // accounting concern, not a tutor-facing error.
      }
    },
    [whiteboardSessionId]
  );

  // Fire a ping immediately whenever bothPresent flips, and run a
  // ~10s heartbeat while it stays true.
  useEffect(() => {
    if (!syncUrl) return; // tutor-solo mode — no billable timer
    void pingActive(bothPresent);
    if (!bothPresent) return;
    const HEARTBEAT_MS = 10_000;
    const id = setInterval(() => {
      void pingActive(true);
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [bothPresent, pingActive, syncUrl]);

  // Best-effort "I'm leaving" beacon. sendBeacon is the only way to
  // get a reliable POST off during pagehide on most browsers; we fall
  // back to fetch with keepalive when sendBeacon is unavailable.
  useEffect(() => {
    if (!syncUrl) return;
    const url = `/api/whiteboard/${whiteboardSessionId}/active-ping`;
    const beacon = () => {
      const payload = JSON.stringify({ active: false });
      try {
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function"
        ) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(url, blob);
          return;
        }
      } catch {
        // fall through to fetch
      }
      try {
        void fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      } catch {
        // best-effort only; ignore failures on unload
      }
    };
    window.addEventListener("pagehide", beacon);
    window.addEventListener("beforeunload", beacon);
    return () => {
      window.removeEventListener("pagehide", beacon);
      window.removeEventListener("beforeunload", beacon);
    };
  }, [syncUrl, whiteboardSessionId]);

  // Periodic refetch of the server-truth state. Catches: another
  // device for the same tutor wrote (cross-device sessions are
  // single-tutor in practice but the refetch is cheap insurance),
  // and any drift between the client's optimistic state and what
  // landed in the DB.
  useEffect(() => {
    if (!syncUrl) return;
    const ANCHOR_REFRESH_MS = 30_000;
    const refresh = async () => {
      try {
        const res = await fetch(
          `/api/whiteboard/${whiteboardSessionId}/timer-anchor`,
          { credentials: "same-origin" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          activeMs?: number;
          lastActiveAt?: string | null;
        };
        if (typeof data.activeMs === "number") setServerActiveMs(data.activeMs);
        if (data.lastActiveAt !== undefined) {
          setServerLastActiveAtMs(
            data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : null
          );
        }
      } catch {
        // ignore — next tick will retry
      }
    };
    const id = setInterval(refresh, ANCHOR_REFRESH_MS);
    return () => clearInterval(id);
  }, [syncUrl, whiteboardSessionId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const liveTimerMs = useMemo(
    () =>
      computeDisplayActiveMs({
        nowMs: now,
        serverActiveMs,
        serverLastActiveAtMs,
        clientActiveNow: bothPresent,
        staleThresholdMs: ACTIVE_PING_STALE_MS,
      }),
    [now, serverActiveMs, serverLastActiveAtMs, bothPresent]
  );

  // Whether to show the "(waiting for student)" qualifier. True until
  // we've ever accumulated billable time AND we're not currently
  // both-present. (Once any time is on the clock, we just show the
  // number — pausing is implied by the digits not advancing.)
  const showWaitingForStudent =
    !!syncUrl && serverActiveMs === 0 && !bothPresent;

  // ---------------------------------------------------------------
  // Copy student link
  // ---------------------------------------------------------------

  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopyStudentLink = useCallback(async () => {
    if (!encryptionKey) {
      setCopyState("error");
      setCopyError("Encryption key isn't ready yet — wait a moment and try again.");
      return;
    }
    if (!syncUrl) {
      setCopyState("error");
      setCopyError("Live student collab is disabled in this environment.");
      return;
    }
    setCopyState("copying");
    setCopyError(null);
    try {
      const { token } = await issueJoinToken(whiteboardSessionId);
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const link = `${origin}/w/${token}#k=${encryptionKey}`;
      // Clipboard API often fails after the `await issueJoinToken` above (user
      // activation / document focus). `copyTextToClipboard` falls back to
      // execCommand + prompt so we do not show a false error when copy works.
      await copyTextToClipboard(link);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 3000);
    } catch (err) {
      setCopyState("error");
      setCopyError((err as Error)?.message ?? "Could not generate the link.");
    }
  }, [encryptionKey, syncUrl, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // End-session flow
  // ---------------------------------------------------------------

  const [endingState, setEndingState] = useState<"idle" | "ending" | "error">(
    "idle"
  );
  const [endingError, setEndingError] = useState<string | null>(null);

  const handleEndSession = useCallback(async () => {
    setEndingState("ending");
    setEndingError(null);
    try {
      // Stop recording first so the buildFinalEventsJson call captures
      // the post-pause state including any in-flight diff frames.
      setUserWantsRecording(false);
      // Tiny tick to let the recorder's recordingActive effect run + flush.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      const eventsJson = recorder.buildFinalEventsJson();
      const upload = await uploadWhiteboardEvents({
        whiteboardSessionId,
        studentId,
        eventsJson,
      });
      if (!upload.ok) {
        throw new Error(upload.error);
      }
      await endWhiteboardSession(whiteboardSessionId, upload.blobUrl);
      // Belt-and-suspenders — `endWhiteboardSession` already revokes,
      // but if it succeeded but the redirect failed we want tokens
      // killed before the user can retry.
      await revokeJoinTokensForSession(whiteboardSessionId).catch(() => undefined);
      await recorder.markPersisted();
      clearSessionSceneDraft(whiteboardSessionId);
      router.push(`/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`);
    } catch (err) {
      setEndingState("error");
      setEndingError((err as Error)?.message ?? "Could not end the session.");
      // Don't auto-retry — the tutor decides whether to retry End or
      // keep the session open and try again.
    }
  }, [recorder, router, studentId, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // Restore a per-tab Excalidraw draft after refresh (strokes while
  // "waiting for student" were never in the event log / IDB).
  // ---------------------------------------------------------------

  useEffect(() => {
    if (!excalidrawAPI) return;
    if (hasHydratedSessionDraftRef.current) return;
    const draft = loadSessionSceneDraft(whiteboardSessionId);
    if (!draft) {
      hasHydratedSessionDraftRef.current = true;
      return;
    }
    applyingRemoteToCanvasRef.current = true;
    try {
      excalidrawAPI.updateScene({ elements: draft });
    } finally {
      applyingRemoteToCanvasRef.current = false;
    }
    hasHydratedSessionDraftRef.current = true;
  }, [excalidrawAPI, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // IndexedDB checkpoint "Resume" — the hook recovers the log, but the
  // live canvas only updates if we push elements into Excalidraw here.
  // ---------------------------------------------------------------

  const handleAcceptCheckpointResume = useCallback(async () => {
    const result = await recorder.acceptResume();
    const api = excalidrawAPIRef.current;
    if (!result || !api) return;
    // Raw `toExcalidraw` is missing many required Excalidraw fields; replay
    // also relies on `restoreElements` in practice for valid scene paint.
    const { restoreElements } = await import("@excalidraw/excalidraw");
    const rough = result.elements.map((el) => toExcalidraw(el));
    const restored = restoreElements(rough as never, null, {
      refreshDimensions: true,
    });
    applyingRemoteToCanvasRef.current = true;
    try {
      let toPaint: ReadonlyArray<unknown> = restored as ReadonlyArray<unknown>;
      if (toPaint.length === 0) {
        const draft = loadSessionSceneDraft(whiteboardSessionId);
        if (draft && draft.length > 0) toPaint = draft;
      }
      api.updateScene({ elements: toPaint });
    } finally {
      applyingRemoteToCanvasRef.current = false;
    }
    clearSessionSceneDraft(whiteboardSessionId);
  }, [recorder, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // Excalidraw onChange wiring
  // ---------------------------------------------------------------

  const handleExcalidrawChange = useCallback(
    (
      elements: ReadonlyArray<unknown>,
      _appState?: unknown,
      files?: Readonly<Record<string, BinaryFileFromExcalidraw>>
    ) => {
      if (applyingRemoteToCanvasRef.current) return;
      const els = elements as ReadonlyArray<ExcalidrawLikeElement>;
      pageDataRef.current[activePageId] = [...els];
      onLocalElementSnapshot(elements);
      if (sceneDraftTimerRef.current !== null) {
        clearTimeout(sceneDraftTimerRef.current);
        sceneDraftTimerRef.current = null;
      }
      sceneDraftTimerRef.current = setTimeout(() => {
        saveSessionSceneDraft(whiteboardSessionId, elements);
        sceneDraftTimerRef.current = null;
      }, 800);
      // Cast through ExcalidrawLikeElement — the adapter only reads the
      // structural fields we declared. We keep the parameter typed as
      // unknown[] so a future Excalidraw upgrade with a stricter type
      // doesn't break the call site.
      recorder.onCanvasChange(elements as ReadonlyArray<ExcalidrawLikeElement>);

      // Excalidraw's own image tool / library / drop: elements carry
      // fileId but no customData.assetUrl. Upload from local BinaryFiles
      // so the student can hydrate (our Insert PDF/image path already
      // sets assetUrl at insert time).
      const api = excalidrawAPIRef.current;
      if (api) {
        void (async () => {
          try {
            const getFiles = (): Record<string, BinaryFileFromExcalidraw> => {
              const raw = api.getFiles?.();
              return raw && typeof raw === "object"
                ? (raw as Record<string, BinaryFileFromExcalidraw>)
                : {};
            };
            const patched = await ensureNativeImageAssetUrlsForSync({
              elements,
              files: files as Record<string, BinaryFileFromExcalidraw> | undefined,
              getFiles,
              whiteboardSessionId,
              studentId,
              fileIdToAssetUrl: tutorNativeImageFileIdToAssetUrlRef.current,
              inFlight: tutorNativeImageUploadInFlightRef.current,
            });
            if (patched && excalidrawAPIRef.current) {
              excalidrawAPIRef.current.updateScene({ elements: patched });
            }
          } catch (err) {
            console.warn(
              "[WhiteboardWorkspaceClient] native image asset URL back-fill failed:",
              (err as Error)?.message ?? String(err)
            );
          }
        })();
      }
    },
    [
      onLocalElementSnapshot,
      activePageId,
      recorder,
      studentId,
      whiteboardSessionId,
    ]
  );

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Toolbar */}
      <div
        className="card"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {!userWantsRecording ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => setUserWantsRecording(true)}
              disabled={endingState === "ending"}
              data-testid="wb-start-recording"
            >
              Start recording
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => setUserWantsRecording(false)}
              data-testid="wb-pause-recording"
            >
              Pause recording
            </button>
          )}
          <button
            type="button"
            className="btn danger"
            onClick={handleEndSession}
            disabled={endingState === "ending"}
            data-testid="wb-end-session"
          >
            {endingState === "ending" ? "Ending…" : "End session"}
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <StatusPill
            color={presence.pillColor}
            label={presence.pillLabel}
            testId="wb-recording-pill"
          />
          {syncUrl && (
            <StatusPill
              color={
                bothPresent
                  ? "green"
                  : tutorSyncConnected
                    ? "amber"
                    : "grey"
              }
              label={
                bothPresent
                  ? "Student connected"
                  : tutorSyncConnected
                    ? "Awaiting student"
                    : "Connecting…"
              }
              testId="wb-sync-pill"
            />
          )}
          <StatusPill
            color="blue"
            label={
              showWaitingForStudent
                ? `Session: ${formatDuration(liveTimerMs)} (waiting for student)`
                : `Session: ${formatDuration(liveTimerMs)}`
            }
            testId="wb-timer"
          />
        </div>
        {syncUrl && (
          <div
            className="row"
            style={{
              width: "100%",
              flexBasis: "100%",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
            }}
            data-testid="wb-tutor-page-strip"
          >
            <span className="muted" style={{ fontSize: 12 }}>
              Pages
            </span>
            {pageList.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn"
                onClick={() => void selectTutorPage(p.id)}
                disabled={endingState === "ending" || p.id === activePageId}
                style={
                  p.id === activePageId
                    ? { fontWeight: 700, borderWidth: 2, borderColor: "var(--border-strong, #999)" }
                    : undefined
                }
              >
                {p.title}
              </button>
            ))}
            <button
              type="button"
              className="btn"
              onClick={addTutorPage}
              disabled={endingState === "ending" || pageList.length >= 20}
            >
              + Page
            </button>
          </div>
        )}
        <UndoRedoButtons disabled={endingState === "ending"} />
        <PdfImageUploadButton
          excalidrawAPI={excalidrawAPI}
          whiteboardSessionId={whiteboardSessionId}
          studentId={studentId}
          disabled={endingState === "ending"}
        />
        <MathInsertButton
          excalidrawAPI={excalidrawAPI}
          whiteboardSessionId={whiteboardSessionId}
          studentId={studentId}
          disabled={endingState === "ending"}
        />
        <DesmosInsertButton
          excalidrawAPI={excalidrawAPI}
          whiteboardSessionId={whiteboardSessionId}
          studentId={studentId}
          disabled={endingState === "ending"}
        />
        <button
          type="button"
          className="btn"
          onClick={handleCopyStudentLink}
          disabled={!syncUrl || copyState === "copying"}
          data-testid="wb-copy-student-link"
        >
          {copyState === "copying"
            ? "Generating…"
            : copyState === "copied"
              ? "Link copied!"
              : "Copy student link"}
        </button>
      </div>

      {/* Banners */}
      {presence.bannerMessage && (
        <Banner tone="warning" testId="wb-recording-autopause-banner">
          {presence.bannerMessage}
        </Banner>
      )}
      {copyState === "error" && copyError && (
        <Banner tone="error" onDismiss={() => setCopyState("idle")}>
          Could not copy student link: {copyError}
        </Banner>
      )}
      {peerImageMaterialNotice !== "none" && (
        <Banner
          tone="warning"
          testId="wb-peer-material-notice"
          onDismiss={() => setPeerImageMaterialNotice("none")}
        >
          {peerImageMaterialNotice === "load" ? (
            <>
              Couldn&apos;t load a shared image (network or link). If the
              board looks wrong, check your connection or re-insert the
              worksheet with PDF/image. For pasted images, the student may need
              to re-draw or you can re-add the file from your machine.
            </>
          ) : (
            <>
              The live scene includes an image with no file link (often a
              device paste). Re-inserting from PDF/image is the most reliable
              way to put the same material on both sides.
            </>
          )}
        </Banner>
      )}
      {endingState === "error" && endingError && (
        <Banner tone="error" onDismiss={() => setEndingState("idle")}>
          Could not end session: {endingError}. Your work is still in progress;
          retry &quot;End session&quot;.
        </Banner>
      )}
      {recorder.checkpointStatus === "error" && recorder.checkpointError && (
        <Banner tone="warning">
          Checkpoint save failed: {recorder.checkpointError}. The session is
          still recording in memory; we&apos;ll keep retrying.
        </Banner>
      )}
      {recorder.resumePrompt && (
        <Banner tone="info">
          <strong>Browser recovery (IndexedDB):</strong> a whiteboard
          event draft from{" "}
          {new Date(recorder.resumePrompt.startedAt).toLocaleString()} (~
          {formatDuration(recorder.resumePrompt.durationMs)} of logged
          time). This is <em>not</em> the &quot;stale session&quot; room
          dialog (that one only controls reconnecting to the live relay).{" "}
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8 }}
            disabled={!excalidrawAPI}
            onClick={() => void handleAcceptCheckpointResume()}
          >
            Load draft into board
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 4 }}
            onClick={() => void recorder.declineResume()}
          >
            Discard
          </button>
        </Banner>
      )}

      {/* Canvas: explicit card + height chain + fill so Excalidraw isn't 0px tall */}
      <div
        className="card"
        data-testid="tutor-whiteboard-canvas-mount"
        style={{
          marginTop: 4,
          padding: 0,
          minHeight: 480,
          height: "max(480px, calc(100vh - 300px))",
          width: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 400,
            width: "100%",
            position: "relative",
          }}
        >
          <ExcalidrawDynamic
            style={{ width: "100%", height: "100%" }}
            onChange={handleExcalidrawChange}
            excalidrawAPI={(api: unknown) => {
              // Cast through unknown so the structural ExcalidrawApiLike
              // shape (defined in insert-asset.ts) doesn't depend on the
              // upstream branded readonly types — see that file for why.
              const like = api as ExcalidrawApiLike;
              excalidrawAPIRef.current = like;
              setExcalidrawAPI(like);
            }}
            theme={excalidrawTheme}
            UIOptions={{ canvasActions: { saveToActiveFile: false } }}
            // Allow Desmos hosts in the embed-allowlist. The CSP
            // `frame-src` directive in `next.config.ts` is the real
            // safety boundary — this just stops Excalidraw from showing
            // its "untrusted source" warning panel for Desmos.
            validateEmbeddable={validateExcalidrawEmbeddable}
          />
        </div>
      </div>

      {/* Footer status — small text muted, helps debugging mid-session */}
      <div className="muted" style={{ fontSize: 11, textAlign: "right" }}>
        wbsid={whiteboardSessionId.slice(0, 8)} · events={recorder.eventCount} ·
        recorded={formatDuration(recorder.durationMs)} ·
        checkpoint={recorder.checkpointStatus}
        {recorder.lastCheckpointAt
          ? ` (last ${new Date(recorder.lastCheckpointAt).toLocaleTimeString()})`
          : ""}
        {" · "}student: {studentName}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Tiny presentational helpers — kept inline to avoid a sprawling
// components/ tree just for this page.
// -------------------------------------------------------------------

function StatusPill({
  color,
  label,
  testId,
}: {
  color: "red" | "green" | "amber" | "grey" | "blue";
  label: string;
  testId?: string;
}) {
  const palette: Record<typeof color, { bg: string; fg: string; dot: string }> =
    {
      red: { bg: "rgba(220,38,38,0.18)", fg: "#dc2626", dot: "#dc2626" },
      green: { bg: "rgba(34,197,94,0.18)", fg: "#16a34a", dot: "#16a34a" },
      amber: { bg: "rgba(234,179,8,0.18)", fg: "#a16207", dot: "#ca8a04" },
      grey: { bg: "rgba(100,116,139,0.18)", fg: "#475569", dot: "#64748b" },
      blue: { bg: "rgba(37,99,235,0.18)", fg: "#1d4ed8", dot: "#2563eb" },
    };
  const p = palette[color];
  return (
    <span
      data-testid={testId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: p.bg,
        color: p.fg,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: p.dot,
        }}
      />
      {label}
    </span>
  );
}

function Banner({
  tone,
  children,
  onDismiss,
  testId,
}: {
  tone: "error" | "warning" | "info";
  children: React.ReactNode;
  onDismiss?: () => void;
  testId?: string;
}) {
  const palette = {
    error: { bg: "rgba(220,38,38,0.12)", border: "rgba(220,38,38,0.4)" },
    warning: { bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.4)" },
    info: { bg: "rgba(37,99,235,0.12)", border: "rgba(37,99,235,0.4)" },
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-testid={testId}
      className="card"
      style={{
        padding: "10px 14px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 13 }}>{children}</div>
      {onDismiss && (
        <button
          type="button"
          className="btn"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}
