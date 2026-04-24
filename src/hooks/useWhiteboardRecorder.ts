"use client";

/**
 * Whiteboard recorder hook — the spine of the Phase 1 whiteboard.
 *
 * Composes with `useAudioRecorder` (the workspace component owns that
 * one and passes us `getAudioMs` + `recordingActive`) to produce a
 * canonical, audio-aligned `WBEventLog` that
 * `WhiteboardReplay` can play back in lockstep with the audio.
 *
 * Plan responsibilities folded in here (do NOT remove without re-reading
 * the plan blockers each invariant addresses):
 *
 *   1. **Audio-clock t** (plan blocker #2): every event's `t` field
 *      is `getAudioMs()`, never `Date.now()`. The audio clock pauses
 *      when the recorder pauses, freezes when MediaRecorder is
 *      throttled by an iOS background tab, and resumes monotonic on
 *      foreground-return — exactly the timing replay needs.
 *
 *   2. **recordingActive gate** (plan blocker #4 — pause race):
 *      while `recordingActive=false` (idle / ready / paused / uploading
 *      / done) we do NOT append scene-diff events to the log. The
 *      tutor can still draw on the canvas (e.g. setting up the board
 *      before Start) — those strokes just don't end up in the
 *      recording. On the false → true transition we emit a `snapshot`
 *      so the recording starts from the visible state, not a blank
 *      canvas.
 *
 *   3. **Diff via adapter** (plan blocker #3 — < 500 KB events):
 *      `Excalidraw.onChange` fires for every cursor move; we throttle
 *      to ~one diff every `DIFF_INTERVAL_MS` and use
 *      `diffScenes()` to emit only add / update / remove deltas.
 *      Full snapshots only at start and after pause/resume.
 *
 *   4. **ingestRemote** (live sync from student): the sync client
 *      hands us `(peerId, elements)` whenever the student emits a
 *      scene update. We canonicalise, tag clientId, and run the
 *      same diff path — student strokes land in the log with their
 *      author tag so replay can colour them differently.
 *
 *   5. **IndexedDB checkpoint** (plan blocker #1 — crash recovery):
 *      every `IDB_CHECKPOINT_INTERVAL_MS` (default 30 s) and on
 *      visibilitychange (visible → hidden) we flush the WBEventLog
 *      to IndexedDB. On reload of the workspace for the same tutor
 *      we surface a "Resume" prompt.
 *
 *   6. **visibilitychange + sync markers**: the log carries
 *      `tab-hidden` / `tab-visible` / `sync-disconnect` /
 *      `sync-reconnect` markers as DEBUG breadcrumbs. They never
 *      affect scene reconstruction but help us reason about
 *      mid-session anomalies after the fact.
 *
 *   7. **Resume from crash**: on mount we call
 *      `findCheckpoint("whiteboard", ownerKey)` for THIS session id
 *      AND a fallback `findLatestCheckpointForOwner` keyed on
 *      tutor+student so a brand-new session id can recover from a
 *      session id that crashed without ever ending. The workspace
 *      component decides whether to actually surface the prompt.
 *
 *   8. **wbsid logging**: every console line is tagged
 *      `[useWhiteboardRecorder] wbsid=<sessionId> ...` to mirror the
 *      `rid=` correlation we use server-side.
 *
 * Failure-mode contract: this hook NEVER throws into a React render.
 * Every async path returns a structured result; recoverable errors
 * surface via `checkpointStatus / checkpointError` so the workspace
 * can decide whether to interrupt the tutor.
 *
 * What lives elsewhere (deliberate split):
 *   - The MediaRecorder + mic graph + meter:           useAudioRecorder
 *   - The WS protocol + welcome packet + reconnect:    sync-client.ts
 *   - The blob upload (`/api/upload/blob`):            workspace page
 *   - The Excalidraw <Excalidraw /> render:            workspace page
 *   - The replay player:                               WhiteboardReplay
 *
 * That split keeps each surface small enough to verify in isolation.
 * If you find yourself reaching out to MediaRecorder or fetch() from
 * inside this file, stop and reconsider.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendEvent,
  createEmptyEventLog,
  WB_EVENT_LOG_SCHEMA_VERSION,
  type WBElement,
  type WBEvent,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import {
  canonicalizeScene,
  diffScenes,
  snapshotEvent,
  type ExcalidrawLikeElement,
} from "@/lib/whiteboard/excalidraw-adapter";
import {
  audioOwnerKey as _audioOwnerKey, // re-export hint; not used here
  clearCheckpoint,
  findCheckpoint,
  findLatestCheckpointForOwner,
  saveCheckpoint,
  whiteboardOwnerKey,
  type SaveCheckpointResult,
} from "@/lib/whiteboard/checkpoint-store";
import { consumeSkipIndexedDbResumeAfterGate } from "@/lib/whiteboard/resume-prompt-flags";

void _audioOwnerKey;

/**
 * Ask the server whether a whiteboard row is already ended. Used to
 * garbage-collect IndexedDB checkpoints after the tutor ends sessions
 * from the student list — local IDB is not cleared by server actions.
 */
async function fetchSessionEndedOnServer(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/whiteboard/${encodeURIComponent(sessionId)}/session-ended`,
      { credentials: "same-origin" }
    );
    if (!res.ok) return false;
    const j = (await res.json()) as { ended?: boolean };
    return j.ended === true;
  } catch {
    return false;
  }
}

/**
 * Diff throttle — Excalidraw fires onChange on every pointer move; one
 * canonical diff every 100 ms is plenty for replay smoothness and
 * keeps the events.json under the 500 KB target for typical sessions.
 *
 * Tuning: at 100 ms a 30-min session generates max 18000 diff events;
 * at < 1 KB per typical patch (a freehand point append) that's ~18 MB
 * worst case but real sessions average closer to 2 KB / 10 s of
 * activity = ~360 KB.
 */
const DIFF_INTERVAL_MS = 100;

/** IndexedDB checkpoint cadence. */
const IDB_CHECKPOINT_INTERVAL_MS = 30_000;

/**
 * Minimal contract the recorder needs from the live-sync client.
 * The full implementation lives in `src/lib/whiteboard/sync-client.ts`
 * (separate Opus todo); this typedef is the hand-off point.
 *
 * The hook does NOT own the WS lifecycle — it subscribes to events
 * and broadcasts canonical scene deltas. The workspace component
 * mounts the sync client and passes it in.
 */
export type WhiteboardSyncClientLike = {
  /** Subscribe to scene snapshots from peer clients (the student). */
  onRemoteScene: (
    cb: (peerId: string, elements: ReadonlyArray<ExcalidrawLikeElement>) => void
  ) => () => void;
  /** Subscribe to connection-up notifications. */
  onConnect: (cb: () => void) => () => void;
  /** Subscribe to connection-down notifications. */
  onDisconnect: (cb: () => void) => () => void;
  /**
   * Broadcast the local canonical scene to peers. Throttled internally
   * by the sync-client implementation — the recorder calls it on
   * every diff but that's fine.
   */
  broadcastScene: (elements: ReadonlyArray<ExcalidrawLikeElement>) => void;
  /** True when the WS handshake completed. */
  isConnected: () => boolean;
};

/**
 * Result of `acceptResume` — the workspace component uses this to
 * push the recovered scene into the live Excalidraw instance.
 */
export type ResumeResult = {
  log: WBEventLog;
  /** The latest reconstructed scene at `log.durationMs`. */
  elements: WBElement[];
};

export type UseWhiteboardRecorderOptions = {
  whiteboardSessionId: string;
  /** Logged-in tutor's id, used to scope IndexedDB checkpoints. */
  adminUserId: string;
  /** Student id, used to scope IndexedDB checkpoints. */
  studentId: string;
  /** ISO 8601 wall-clock when the session was created (server-provided). */
  startedAtIso: string;
  /**
   * Source of truth for event timestamps. Returns elapsed ms in the
   * audio clock — should be 0 when the audio recorder hasn't started,
   * frozen during pause, monotonically increasing during recording.
   */
  getAudioMs: () => number;
  /** Whether the audio recorder is currently capturing. */
  recordingActive: boolean;
  /** Optional live-sync client. Hook still works without sync (single-tutor). */
  sync?: WhiteboardSyncClientLike | null;
  /**
   * Push a remote peer's scene into the live Excalidraw instance on
   * the tutor canvas. Without this, `ingestRemote` updates the event
   * log but the tutor never sees student strokes / shared images.
   */
  applyRemoteToCanvas?: (
    elements: ReadonlyArray<ExcalidrawLikeElement>
  ) => void | Promise<void>;
  /**
   * Local client id — broadcast on every `add` event so replay can
   * colour-tag strokes by author. Defaults to a random uuid.
   */
  localClientId?: string;
};

export type UseWhiteboardRecorderReturn = {
  /** Plug into `<Excalidraw onChange={onCanvasChange} />`. */
  onCanvasChange: (elements: ReadonlyArray<ExcalidrawLikeElement>) => void;
  /** Call when the sync-client receives a remote scene from the student. */
  ingestRemote: (
    peerId: string,
    elements: ReadonlyArray<ExcalidrawLikeElement>
  ) => void;
  /** Live size of the in-memory event log (for the UI's "events: N" debug pill). */
  eventCount: number;
  /** Most recent t in ms — useful for "X minutes recorded" copy. */
  durationMs: number;
  /** Latest checkpoint timestamp; null until the first save lands. */
  lastCheckpointAt: string | null;
  /** Surface IDB save state to the UI banner. */
  checkpointStatus: "idle" | "saving" | "saved" | "error";
  /** User-facing copy when checkpointStatus = "error". */
  checkpointError: string | null;
  /** True when the WS reports "connected" — drives the "live with student" pill. */
  syncConnected: boolean;
  /** Set on mount if a recoverable in-progress session was found. */
  resumePrompt: ResumeAvailability | null;
  /** Restore the most-recent checkpoint into the live log. */
  acceptResume: () => Promise<ResumeResult | null>;
  /** Discard the recovered checkpoint. */
  declineResume: () => Promise<void>;
  /**
   * Build the final events.json string for upload. Caller is the
   * workspace page, which posts it to `/api/upload/blob`
   * (kind="whiteboard-events"). Does NOT clear local state.
   */
  buildFinalEventsJson: () => string;
  /**
   * Call AFTER the workspace component successfully persists the
   * events.json to Vercel Blob and updates `WhiteboardSession.eventsBlobUrl`.
   * Clears the IDB checkpoint so a future page-load doesn't surface
   * "Resume previous session" for a session that already finalized.
   */
  markPersisted: () => Promise<void>;
};

export type ResumeAvailability = {
  /** Where the checkpoint was found ("this-session" = exact id match). */
  source: "this-session" | "latest-for-owner";
  /** ISO 8601 wall-clock of the original startedAt. */
  startedAt: string;
  /** Approximate "minutes recorded" for the prompt copy. */
  durationMs: number;
  /** Underlying sessionId of the checkpoint (may differ from the live one). */
  sessionId: string;
};

type CheckpointPayload = {
  log: WBEventLog;
};

function makeRandomClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fallthrough
    }
  }
  return `cid_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function useWhiteboardRecorder(
  opts: UseWhiteboardRecorderOptions
): UseWhiteboardRecorderReturn {
  const {
    whiteboardSessionId,
    adminUserId,
    studentId,
    startedAtIso,
    getAudioMs,
    recordingActive,
    sync,
  } = opts;

  // Keep `getAudioMs` and `sync` reachable via refs so we don't
  // re-bind effect listeners every render (which would tear down
  // visibility/sync subscriptions every keystroke).
  const getAudioMsRef = useRef(getAudioMs);
  useEffect(() => {
    getAudioMsRef.current = getAudioMs;
  }, [getAudioMs]);
  const syncRef = useRef<WhiteboardSyncClientLike | null>(sync ?? null);
  useEffect(() => {
    syncRef.current = sync ?? null;
  }, [sync]);
  const applyRemoteToCanvasRef = useRef(opts.applyRemoteToCanvas);
  useEffect(() => {
    applyRemoteToCanvasRef.current = opts.applyRemoteToCanvas;
  }, [opts.applyRemoteToCanvas]);
  const recordingActiveRef = useRef(recordingActive);

  const localClientId = useMemo(
    () => opts.localClientId ?? makeRandomClientId(),
    [opts.localClientId]
  );

  const ownerKey = useMemo(
    () => whiteboardOwnerKey(adminUserId, studentId, whiteboardSessionId),
    [adminUserId, studentId, whiteboardSessionId]
  );

  // The single canonical log we mutate in place across the whole
  // session. `appendEvent` is a no-copy push — re-snapshotting per
  // event would dwarf the actual recording cost.
  const logRef = useRef<WBEventLog>(createEmptyEventLog(startedAtIso));
  // Last canonicalised scene — input to `diffScenes` on the next change.
  const prevElementsRef = useRef<WBElement[]>([]);
  // Throttle Excalidraw's per-frame onChange to one diff per
  // DIFF_INTERVAL_MS. We keep the most recent payload and flush it on
  // a trailing-edge timer.
  const pendingFrameRef = useRef<ReadonlyArray<ExcalidrawLikeElement> | null>(
    null
  );
  const diffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [eventCount, setEventCount] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [lastCheckpointAt, setLastCheckpointAt] = useState<string | null>(null);
  const [checkpointStatus, setCheckpointStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [syncConnected, setSyncConnected] = useState<boolean>(
    () => sync?.isConnected() ?? false
  );
  const [resumePrompt, setResumePrompt] = useState<ResumeAvailability | null>(
    null
  );

  // Cache the resumable checkpoint so acceptResume doesn't need a second IDB read.
  const cachedResumeRef = useRef<{
    log: WBEventLog;
    sessionId: string;
  } | null>(null);

  /** Push an event, refresh derived UI state. Single point of mutation. */
  const pushEvent = useCallback((ev: WBEvent) => {
    appendEvent(logRef.current, ev);
    setEventCount(logRef.current.events.length);
    setDurationMs(logRef.current.durationMs);
  }, []);

  // ---------------------------------------------------------------
  // Section A — onCanvasChange + ingestRemote (the hot path)
  // ---------------------------------------------------------------

  const flushPendingDiff = useCallback(() => {
    diffTimerRef.current = null;
    const frame = pendingFrameRef.current;
    pendingFrameRef.current = null;
    if (!frame) return;
    if (!recordingActiveRef.current) {
      // Discard: we shouldn't be logging events when audio isn't
      // capturing. The pre-recording canvas state is captured by the
      // false→true snapshot below.
      return;
    }
    const next = canonicalizeScene(frame);
    const t = Math.max(0, Math.floor(getAudioMsRef.current()));
    const events = diffScenes(prevElementsRef.current, next, t);
    for (const ev of events) {
      // Stamp clientId on `add` events so replay can colour-attribute.
      if (ev.type === "add" && !ev.element.clientId) {
        ev.element.clientId = localClientId;
      }
      pushEvent(ev);
    }
    prevElementsRef.current = next;
    // Broadcast to peers so the student sees the update. Sync-client
    // throttles internally; we don't need to debounce here twice.
    try {
      syncRef.current?.broadcastScene(frame);
    } catch (err) {
      console.warn(
        `[useWhiteboardRecorder] wbsid=${whiteboardSessionId} broadcast failed:`,
        (err as Error)?.message ?? String(err)
      );
    }
  }, [localClientId, pushEvent, whiteboardSessionId]);

  const onCanvasChange = useCallback(
    (elements: ReadonlyArray<ExcalidrawLikeElement>) => {
      pendingFrameRef.current = elements;
      if (diffTimerRef.current === null) {
        diffTimerRef.current = setTimeout(flushPendingDiff, DIFF_INTERVAL_MS);
      }
    },
    [flushPendingDiff]
  );

  const ingestRemote = useCallback(
    (
      peerId: string,
      elements: ReadonlyArray<ExcalidrawLikeElement>
    ) => {
      // Tag every element with the originating peerId so replay can
      // attribute strokes correctly. We mutate the customData field
      // because the canonicaliser reads it.
      const stamped = elements.map((el) => {
        if (el.customData?.clientId === peerId) return el;
        return {
          ...el,
          customData: {
            ...(el.customData ?? {}),
            clientId: peerId,
          },
        };
      });
      const paint = applyRemoteToCanvasRef.current;
      if (paint) {
        void Promise.resolve(paint(stamped)).catch((err) => {
          console.warn(
            `[useWhiteboardRecorder] wbsid=${whiteboardSessionId} applyRemoteToCanvas failed:`,
            (err as Error)?.message ?? String(err)
          );
        });
      }
      // Funnel through the same throttled diff so a flurry of remote
      // strokes doesn't outpace local strokes in the log. Treat as a
      // pending frame (same trailing-edge debounce).
      pendingFrameRef.current = stamped;
      if (diffTimerRef.current === null) {
        diffTimerRef.current = setTimeout(flushPendingDiff, DIFF_INTERVAL_MS);
      }
    },
    [flushPendingDiff, whiteboardSessionId]
  );

  // ---------------------------------------------------------------
  // Section B — recordingActive transitions (pause / resume / snapshot)
  // ---------------------------------------------------------------

  useEffect(() => {
    const wasActive = recordingActiveRef.current;
    if (wasActive === recordingActive) {
      // Keep the ref in sync (covers initial-mount with the same value).
      recordingActiveRef.current = recordingActive;
      return;
    }
    const t = Math.max(0, Math.floor(getAudioMsRef.current()));

    if (!wasActive && recordingActive) {
      // Off → on. Update the ref FIRST so flush gates open before we
      // emit the snapshot. (Snapshot emission goes through pushEvent
      // directly, but follow-up onCanvasChange flushes need the gate
      // to read the new value.)
      recordingActiveRef.current = true;
      // Snapshot the current scene so replay starts from the visible
      // state, not a blank canvas. If the canvas is empty, snapshot
      // is just `{ elements: [] }` which is fine.
      pushEvent(snapshotEvent(prevElementsRef.current, t));
      // The first-flip case (start of recording) also looks like a
      // "resume" semantically (audio just woke up) — but emitting a
      // resume marker on the very first start is misleading. Use the
      // log being non-empty as the heuristic.
      if (logRef.current.events.length > 1) {
        pushEvent({ t, type: "resume" });
      }
    } else if (wasActive && !recordingActive) {
      // On → off. Flush any pending diff BEFORE flipping the gate,
      // so the last stroke before pause lands in the log at the
      // correct t (this was a real bug caught in the jsdom test —
      // flipping the gate first caused flushPendingDiff to discard
      // the in-flight frame).
      if (diffTimerRef.current !== null) {
        clearTimeout(diffTimerRef.current);
        diffTimerRef.current = null;
        flushPendingDiff();
      }
      recordingActiveRef.current = false;
      pushEvent({ t, type: "pause" });
    }
  }, [recordingActive, flushPendingDiff, pushEvent]);

  // ---------------------------------------------------------------
  // Section C — visibilitychange markers + immediate IDB flush
  // ---------------------------------------------------------------

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      const t = Math.max(0, Math.floor(getAudioMsRef.current()));
      if (document.hidden) {
        pushEvent({ t, type: "tab-hidden" });
        // Immediate checkpoint flush — the tab might never come back
        // (iOS can kill backgrounded tabs aggressively).
        void runCheckpoint();
      } else {
        pushEvent({ t, type: "tab-visible" });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
    // runCheckpoint is stable via useCallback below, but leaving it
    // out of deps is intentional — we don't want to re-bind the
    // listener every render. ESLint intentionally disabled here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushEvent]);

  // ---------------------------------------------------------------
  // Section D — sync-client connection state + markers
  // ---------------------------------------------------------------

  useEffect(() => {
    const client = syncRef.current;
    if (!client) {
      setSyncConnected(false);
      return;
    }
    setSyncConnected(client.isConnected());

    const offConnect = client.onConnect(() => {
      setSyncConnected(true);
      const t = Math.max(0, Math.floor(getAudioMsRef.current()));
      // Only emit reconnect markers while recording is active so the
      // log stays tight pre-recording.
      if (recordingActiveRef.current) {
        pushEvent({ t, type: "sync-reconnect" });
      }
      console.log(
        `[useWhiteboardRecorder] wbsid=${whiteboardSessionId} sync connected`
      );
    });

    const offDisconnect = client.onDisconnect(() => {
      setSyncConnected(false);
      const t = Math.max(0, Math.floor(getAudioMsRef.current()));
      if (recordingActiveRef.current) {
        pushEvent({ t, type: "sync-disconnect" });
      }
      console.warn(
        `[useWhiteboardRecorder] wbsid=${whiteboardSessionId} sync disconnected`
      );
    });

    const offRemote = client.onRemoteScene((peerId, elements) => {
      ingestRemote(peerId, elements);
    });

    return () => {
      offConnect();
      offDisconnect();
      offRemote();
    };
  }, [sync, ingestRemote, pushEvent, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // Section E — IndexedDB checkpoint loop
  // ---------------------------------------------------------------

  const runCheckpoint = useCallback(async () => {
    // Don't checkpoint a brand-new empty log — nothing to recover.
    if (logRef.current.events.length === 0) return;
    setCheckpointStatus("saving");
    setCheckpointError(null);
    const result: SaveCheckpointResult = await saveCheckpoint<CheckpointPayload>({
      kind: "whiteboard",
      ownerKey,
      sessionId: whiteboardSessionId,
      adminUserId,
      studentId,
      startedAt: startedAtIso,
      schemaVersion: WB_EVENT_LOG_SCHEMA_VERSION,
      payload: { log: logRef.current },
    });
    if (result.ok) {
      setCheckpointStatus("saved");
      setLastCheckpointAt(new Date().toISOString());
    } else {
      setCheckpointStatus("error");
      setCheckpointError(result.message);
      console.warn(
        `[useWhiteboardRecorder] wbsid=${whiteboardSessionId} checkpoint reason=${result.reason}: ${result.message}`
      );
    }
  }, [
    adminUserId,
    ownerKey,
    startedAtIso,
    studentId,
    whiteboardSessionId,
  ]);

  useEffect(() => {
    const id = setInterval(() => {
      // Run the checkpoint regardless of recordingActive — even paused
      // sessions accumulate `pause` markers worth recovering.
      void runCheckpoint();
    }, IDB_CHECKPOINT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [runCheckpoint]);

  // ---------------------------------------------------------------
  // Section F — Resume-from-crash detection on mount
  // ---------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Try the exact session id first (workspace re-mount on the
      // same session url) — that's the highest-fidelity recovery.
      const exact = await findCheckpoint<CheckpointPayload>(
        "whiteboard",
        ownerKey
      );
      if (cancelled) return;
      if (exact) {
        // Server may have ended this session from another tab / the
        // student-page list; IndexedDB still holds a local checkpoint
        // until we clear it or the user Discards.
        const serverEnded = await fetchSessionEndedOnServer(exact.sessionId);
        if (cancelled) return;
        if (serverEnded) {
          await clearCheckpoint("whiteboard", ownerKey);
          return;
        }
        // User already confirmed the stale room gate; skip a second
        // IndexedDB prompt for this session on the same page load.
        if (consumeSkipIndexedDbResumeAfterGate(whiteboardSessionId)) {
          return;
        }
        cachedResumeRef.current = {
          log: exact.payload.log,
          sessionId: exact.sessionId,
        };
        setResumePrompt({
          source: "this-session",
          startedAt: exact.startedAt,
          durationMs: exact.payload.log.durationMs,
          sessionId: exact.sessionId,
        });
        return;
      }
      // Fallback — a brand-new session url for a tutor + student
      // who has an unfinalised checkpoint elsewhere. The workspace
      // can decide whether to surface this (it's a softer prompt).
      const latest = await findLatestCheckpointForOwner<CheckpointPayload>(
        "whiteboard",
        adminUserId,
        studentId
      );
      if (cancelled) return;
      if (latest) {
        const serverEnded = await fetchSessionEndedOnServer(latest.sessionId);
        if (cancelled) return;
        if (serverEnded) {
          await clearCheckpoint(
            "whiteboard",
            whiteboardOwnerKey(adminUserId, studentId, latest.sessionId)
          );
          return;
        }
        cachedResumeRef.current = {
          log: latest.payload.log,
          sessionId: latest.sessionId,
        };
        setResumePrompt({
          source: "latest-for-owner",
          startedAt: latest.startedAt,
          durationMs: latest.payload.log.durationMs,
          sessionId: latest.sessionId,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminUserId, ownerKey, studentId]);

  const acceptResume = useCallback(async (): Promise<ResumeResult | null> => {
    const cached = cachedResumeRef.current;
    if (!cached) return null;
    logRef.current = cached.log;
    setEventCount(cached.log.events.length);
    setDurationMs(cached.log.durationMs);
    setResumePrompt(null);
    cachedResumeRef.current = null;

    // Reconstruct prevElementsRef from the recovered log so the next
    // diff is computed against the right baseline. We import lazily
    // to avoid a circular ref between this hook and the event-log
    // reconstruct helper at module init.
    const { reconstructSceneAt } = await import("@/lib/whiteboard/event-log");
    const sceneMap = reconstructSceneAt(cached.log, cached.log.durationMs);
    const elements = Array.from(sceneMap.values());
    prevElementsRef.current = elements;
    console.log(
      `[useWhiteboardRecorder] wbsid=${whiteboardSessionId} resumed from checkpoint sessionId=${cached.sessionId} events=${cached.log.events.length}`
    );
    return { log: cached.log, elements };
  }, [whiteboardSessionId]);

  const declineResume = useCallback(async () => {
    const cached = cachedResumeRef.current;
    cachedResumeRef.current = null;
    setResumePrompt(null);
    if (cached) {
      // Best-effort: clear the offered checkpoint so we don't keep
      // re-prompting on every page load. Use the cached sessionId
      // (may differ from this session's id in the latest-for-owner case).
      await clearCheckpoint(
        "whiteboard",
        whiteboardOwnerKey(adminUserId, studentId, cached.sessionId)
      );
    }
  }, [adminUserId, studentId]);

  // ---------------------------------------------------------------
  // Section G — Final flush + persist
  // ---------------------------------------------------------------

  const buildFinalEventsJson = useCallback((): string => {
    // Drain any in-flight diff first so the last stroke isn't lost.
    if (diffTimerRef.current !== null) {
      clearTimeout(diffTimerRef.current);
      diffTimerRef.current = null;
      flushPendingDiff();
    }
    return JSON.stringify(logRef.current);
  }, [flushPendingDiff]);

  const markPersisted = useCallback(async () => {
    await clearCheckpoint("whiteboard", ownerKey);
    setCheckpointStatus("idle");
    setLastCheckpointAt(null);
    console.log(
      `[useWhiteboardRecorder] wbsid=${whiteboardSessionId} cleared local checkpoint after persistence`
    );
  }, [ownerKey, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // Section H — unmount cleanup
  // ---------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (diffTimerRef.current !== null) {
        clearTimeout(diffTimerRef.current);
        diffTimerRef.current = null;
      }
    };
  }, []);

  return {
    onCanvasChange,
    ingestRemote,
    eventCount,
    durationMs,
    lastCheckpointAt,
    checkpointStatus,
    checkpointError,
    syncConnected,
    resumePrompt,
    acceptResume,
    declineResume,
    buildFinalEventsJson,
    markPersisted,
  };
}
