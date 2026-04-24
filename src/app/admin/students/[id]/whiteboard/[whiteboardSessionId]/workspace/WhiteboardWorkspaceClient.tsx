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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  createWhiteboardSyncClient,
  generateEncryptionKeyBase64Url,
  type WhiteboardSyncClient,
} from "@/lib/whiteboard/sync-client";
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
import {
  DESMOS_ALLOWED_HOSTS,
  type ExcalidrawApiLike,
} from "@/lib/whiteboard/insert-asset";

// Excalidraw is ~1MB+ gzipped and pulls in its own React tree; never
// SSR it. The dynamic import lets the workspace shell paint instantly
// while the canvas hydrates client-side.
const Excalidraw = dynamic(
  async () => {
    const mod = await import("@excalidraw/excalidraw");
    // Side-effect CSS import — Excalidraw needs its bundled stylesheet.
    await import("@excalidraw/excalidraw/index.css");
    return mod.Excalidraw;
  },
  { ssr: false, loading: () => <CanvasPlaceholder label="Loading whiteboard…" /> }
);

type Props = {
  whiteboardSessionId: string;
  studentId: string;
  studentName: string;
  adminUserId: string;
  startedAtIso: string;
  bothConnectedAtIso: string | null;
  syncUrl: string | null;
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

/**
 * Excalidraw `validateEmbeddable` callback. Returns true if the URL
 * is on our Desmos allowlist; everything else falls through to
 * Excalidraw's default whitelist (YouTube/Twitter/etc) by returning
 * `undefined`. Returning `false` would *block* the URL.
 *
 * This is a UI gate only — the real cross-origin safety is the CSP
 * `frame-src` directive declared in `next.config.ts`.
 */
function validateExcalidrawEmbeddable(
  url: string
): true | undefined {
  try {
    const parsed = new URL(url);
    if (DESMOS_ALLOWED_HOSTS.includes(parsed.hostname)) return true;
  } catch {
    // ignore — fall through to library default
  }
  return undefined;
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
  syncUrl,
}: Props) {
  const router = useRouter();

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

  const [recordingActive, setRecordingActive] = useState(false);
  const getAudioMs = useAudioMsClock(recordingActive);

  const sync = syncReady ? syncClientRef.current : null;

  const recorder = useWhiteboardRecorder({
    whiteboardSessionId,
    adminUserId,
    studentId,
    startedAtIso,
    getAudioMs,
    recordingActive,
    sync,
  });

  // ---------------------------------------------------------------
  // Live timer (counts continuously while session is open)
  // ---------------------------------------------------------------
  //
  // Sarah's explicit ask: counter that survives disconnects and starts
  // when BOTH parties are connected. `bothConnectedAtIso` is stamped
  // server-side when the student opens the join link
  // (`/w/[joinToken]/page.tsx`). Until the student joins, it's null
  // and the timer counts from `startedAtIso` as a fallback.
  //
  // We store the anchor in state (not just use the prop) so the poll
  // below can update it without a full page reload.

  const [timerAnchorIso, setTimerAnchorIso] = useState<string | null>(
    bothConnectedAtIso
  );

  // Poll for bothConnectedAt every 5 s until we have it.
  useEffect(() => {
    if (timerAnchorIso) return; // already set — stop polling
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/whiteboard/${whiteboardSessionId}/timer-anchor`,
          { credentials: "same-origin" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { bothConnectedAt: string | null };
        if (data.bothConnectedAt) {
          setTimerAnchorIso(data.bothConnectedAt);
        }
      } catch {
        // network hiccup — silently retry on next interval
      }
    };
    void poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [timerAnchorIso, whiteboardSessionId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const liveTimerMs = useMemo(() => {
    const anchor = timerAnchorIso
      ? new Date(timerAnchorIso).getTime()
      : new Date(startedAtIso).getTime();
    return Math.max(0, now - anchor);
  }, [timerAnchorIso, startedAtIso, now]);

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
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        // Fallback: surface the link in a prompt. Better than silent failure
        // when the Clipboard API is missing (older Safari, some embedded views).
        window.prompt("Copy this link for your student:", link);
      }
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
      setRecordingActive(false);
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
      router.push(`/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`);
    } catch (err) {
      setEndingState("error");
      setEndingError((err as Error)?.message ?? "Could not end the session.");
      // Don't auto-retry — the tutor decides whether to retry End or
      // keep the session open and try again.
    }
  }, [recorder, router, studentId, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // Excalidraw onChange wiring
  // ---------------------------------------------------------------

  const handleExcalidrawChange = useCallback(
    (elements: ReadonlyArray<unknown>) => {
      // Cast through ExcalidrawLikeElement — the adapter only reads the
      // structural fields we declared. We keep the parameter typed as
      // unknown[] so a future Excalidraw upgrade with a stricter type
      // doesn't break the call site.
      recorder.onCanvasChange(elements as ReadonlyArray<ExcalidrawLikeElement>);
    },
    [recorder]
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
          {!recordingActive ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => setRecordingActive(true)}
              disabled={endingState === "ending"}
              data-testid="wb-start-recording"
            >
              Start recording
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => setRecordingActive(false)}
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
            color={recordingActive ? "red" : "grey"}
            label={recordingActive ? "Recording" : "Paused"}
            testId="wb-recording-pill"
          />
          {syncUrl && (
            <StatusPill
              color={recorder.syncConnected ? "green" : "amber"}
              label={
                recorder.syncConnected ? "Student connected" : "Awaiting student"
              }
              testId="wb-sync-pill"
            />
          )}
          <StatusPill
            color="blue"
            label={
              timerAnchorIso
                ? `Session: ${formatDuration(liveTimerMs)}`
                : `Session: ${formatDuration(liveTimerMs)} (waiting for student)`
            }
            testId="wb-timer"
          />
        </div>
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
      {copyState === "error" && copyError && (
        <Banner tone="error" onDismiss={() => setCopyState("idle")}>
          Could not copy student link: {copyError}
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
          Found an unsaved whiteboard session from{" "}
          {new Date(recorder.resumePrompt.startedAt).toLocaleString()} (
          {formatDuration(recorder.resumePrompt.durationMs)} recorded).{" "}
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8 }}
            onClick={() => recorder.acceptResume()}
          >
            Resume
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 4 }}
            onClick={() => recorder.declineResume()}
          >
            Discard
          </button>
        </Banner>
      )}

      {/* Canvas */}
      <div style={{ height: "calc(100vh - 280px)", minHeight: 480 }}>
        <Excalidraw
          onChange={handleExcalidrawChange}
          excalidrawAPI={(api) => {
            // Cast through unknown so the structural ExcalidrawApiLike
            // shape (defined in insert-asset.ts) doesn't depend on the
            // upstream branded readonly types — see that file for why.
            setExcalidrawAPI(api as unknown as ExcalidrawApiLike);
          }}
          // Hint Excalidraw to use a clean theme; the workspace shell
          // already provides chrome.
          UIOptions={{ canvasActions: { saveToActiveFile: false } }}
          // Allow Desmos hosts in the embed-allowlist. The CSP
          // `frame-src` directive in `next.config.ts` is the real
          // safety boundary — this just stops Excalidraw from showing
          // its "untrusted source" warning panel for Desmos.
          validateEmbeddable={validateExcalidrawEmbeddable}
        />
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
}: {
  tone: "error" | "warning" | "info";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const palette = {
    error: { bg: "rgba(220,38,38,0.12)", border: "rgba(220,38,38,0.4)" },
    warning: { bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.4)" },
    info: { bg: "rgba(37,99,235,0.12)", border: "rgba(37,99,235,0.4)" },
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
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
