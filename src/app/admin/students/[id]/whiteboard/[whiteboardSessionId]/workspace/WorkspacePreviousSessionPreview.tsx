"use client";

/**
 * Preview-before-Start surface for an already-ended whiteboard session.
 *
 * Pillar 4 follow-on (master plan Phase 1 Task 6). When a tutor opens
 * the workspace route for a session whose `endedAt` is set, we no
 * longer redirect to the read-only review page — instead we render
 * this component, which:
 *
 *   1. Fetches the canonical events.json via the same admin proxy
 *      replay uses (`/api/whiteboard/[sessionId]/events`).
 *   2. Paints the FINAL frame of that log via the shared scene-paint
 *      engine (`createScenePainter.applyAt`), with Excalidraw mounted
 *      in `viewModeEnabled: true` so the canvas is read-only.
 *   3. Fits the camera with the engine's bbox math (same as replay).
 *   4. Renders a "Start a new whiteboard session" affordance — the
 *      existing consent-modal `<StartWhiteboardSession>` — so the
 *      tutor can mint a fresh session in one click.
 *
 * Why a separate component (rather than reusing `<WhiteboardReplay>`):
 *   - Replay carries audio + scrubber + multi-track state; this
 *     surface needs neither.
 *   - The preview is tied to the workspace route, not the review
 *     route — keeping the rendering local to the workspace tree
 *     avoids accidental coupling (e.g. a future replay UX change
 *     wouldn't reshape the preview-before-start surface).
 *   - Exercising the scene-paint engine in TWO surfaces is the
 *     entire point of Pillar 4; a separate consumer proves the
 *     engine is composable, not just embeddable inside replay.
 *
 * Reliability posture (Sarah-bar):
 *   - Snapshot fallback. If events.json fails to parse or is empty
 *     and a `snapshotBlobUrl` is available, we surface the snapshot
 *     PNG as a static thumbnail (the parent share's "open as image"
 *     link, in-page). The "Start a new session" button stays
 *     enabled regardless — the preview is decorative; minting a
 *     fresh session must always be one click away.
 *   - Network/parse errors degrade to a friendly card, never a
 *     stack trace.
 *
 * Logging convention: per-session `wbsid=<id>` plus `pvw=<short>`
 * (3-letter capture prefix per AGENTS.md ID-logging rule).
 *
 * Tests: `src/__tests__/dom/WorkspacePreviewBeforeStart.dom.test.tsx`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";
import { parseEventLogBySchema } from "@/lib/whiteboard/replay-parse";
import {
  maxEventTimestampMs,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import {
  createCameraFitter,
  createScenePainter,
  type ScenePaintApi,
} from "@/lib/whiteboard/scene-paint";
import {
  StartWhiteboardSession,
  type StartWhiteboardSessionProps,
} from "@/app/admin/students/[id]/whiteboard/StartWhiteboardSession";
import { formatClockDuration } from "@/lib/time/format-duration-ms";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; log: WBEventLog }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export type WorkspacePreviousSessionPreviewProps = {
  whiteboardSessionId: string;
  studentId: string;
  studentName: string;
  startedAtIso: string;
  endedAtIso: string;
  durationSeconds: number | null;
  /**
   * Same proxied URL pattern the admin review page uses. Passed in
   * (rather than constructed inside) so the page-level component
   * stays the single owner of route URLs.
   */
  eventsProxyUrl: string;
  /**
   * Proxy URL for the snapshot PNG, when one exists. Used as a
   * decorative fallback if the event log can't be replayed in this
   * surface.
   */
  snapshotProxyUrl: string | null;
  /**
   * Path of the read-only review page so the tutor can jump to the
   * full replay (with audio scrubber etc.) without re-navigating
   * via the back button.
   */
  reviewHref: string;
} & Pick<
  StartWhiteboardSessionProps,
  "consentRecordExists" | "isSelfLearner" | "studentClaimed"
>;

const PVW = (): string => Math.random().toString(36).slice(2, 7);

/**
 * Client-mount-safe date renderer. Avoids React hydration mismatch
 * (error #418) caused by `Date.toLocaleString()` returning UTC during
 * SSR but the user's local TZ during client hydration — that mismatch
 * was tearing down + remounting this entire subtree, which raced with
 * the Excalidraw mount + `applyAt` paint and left the preview canvas
 * blank even though the engine reported `elements=N>0`. See the
 * 2026-05-12 smoke notes in `docs/BACKLOG.md`.
 *
 * The initial render value (`iso`) is the same on server and client,
 * so hydration is clean. The `useEffect` then swaps to the locally-
 * formatted string after mount.
 */
function FormattedTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string>(iso);
  useEffect(() => {
    setText(new Date(iso).toLocaleString());
  }, [iso]);
  return <>{text}</>;
}

export function WorkspacePreviousSessionPreview(
  props: WorkspacePreviousSessionPreviewProps
) {
  const {
    whiteboardSessionId,
    studentId,
    studentName,
    startedAtIso,
    endedAtIso,
    durationSeconds,
    eventsProxyUrl,
    snapshotProxyUrl,
    reviewHref,
  } = props;

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [api, setApi] = useState<ScenePaintApi | null>(null);
  const [restoreReady, setRestoreReady] = useState(false);
  const restoreElementsRef = useRef<
    | (typeof import("@excalidraw/excalidraw"))["restoreElements"]
    | null
  >(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastSceneElementsRef = useRef<readonly unknown[]>([]);
  const initialPaintApiRef = useRef<ScenePaintApi | null>(null);
  const pvwRef = useRef<string>(PVW());
  /**
   * Tracks how many times Excalidraw has fired its `excalidrawAPI`
   * callback for THIS component instance. Replay's source comment
   * notes Excalidraw "may invoke `excalidrawAPI` more than once
   * (internal remounts)"; if that happens here, the prior fitter's
   * pending rAF retries would write into a stale api while the
   * visible new api stays empty. Diagnostic counter so the next
   * smoke makes that failure mode visible without guessing.
   */
  const apiCallbackCountRef = useRef(0);

  const excalidrawTheme = useExcalidrawThemeFromSystem();

  /**
   * Stable references for `initialData` and `UIOptions` so subsequent
   * re-renders of this component (e.g. after `setApi` triggers a
   * state update) don't pass a NEW inline-object reference into
   * Excalidraw. Diagnostic probes from the 2026-05-12 smoke proved
   * that without stable refs, Excalidraw re-applies `initialData` on
   * every prop-reference change and wipes the just-painted scene
   * back to its (empty) initial state — the canvas flashes the
   * strokes for one frame and then goes blank. Hard refresh
   * reproduced the flash visibly. Replay tolerates the same bug
   * because the audio play-loop continuously re-paints; this
   * surface is one-shot, so we have to fix it at the prop layer.
   *
   * `WhiteboardReplay.tsx` line 148 has the same warning in code
   * form: "Excalidraw may clear scene on `updateScene({ appState })`;
   * re-send last paint." Same root cause, different defense.
   */
  const stableInitialData = useMemo(
    () => ({
      elements: [],
      appState: { currentItemFontFamily: 1 },
    }),
    []
  );
  const stableUIOptions = useMemo(
    () => ({ canvasActions: { saveToActiveFile: false } }),
    []
  );

  // -----------------------------------------------------------------
  // Fetch + parse the events log
  // -----------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setLoadState({ kind: "loading" });
    const pvw = pvwRef.current;
    void (async () => {
      try {
        // Same-origin admin proxy needs the tutor cookie. credentials:
        // "include" matches WhiteboardReplay's branch for same-origin
        // proxy URLs; we never construct a cross-origin URL here.
        const res = await fetch(eventsProxyUrl, { credentials: "include" });
        if (!res.ok) {
          throw new Error(
            `Could not load previous session (status ${res.status}).`
          );
        }
        const text = await res.text();
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          throw new Error(
            "Previous session events file isn't valid JSON. The bytes may have been deleted or moved."
          );
        }
        const log = parseEventLogBySchema(raw);
        if (cancelled) return;
        if (log.events.length === 0) {
          console.log(
            `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} log empty — falling back to snapshot/empty card`
          );
          setLoadState({ kind: "empty" });
          return;
        }
        console.log(
          `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} log loaded events=${log.events.length}`
        );
        setLoadState({ kind: "ready", log });
      } catch (err) {
        if (cancelled) return;
        const message =
          (err as Error)?.message ?? "Could not load previous session.";
        console.warn(
          `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} load failed:`,
          message
        );
        setLoadState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventsProxyUrl, whiteboardSessionId]);

  // -----------------------------------------------------------------
  // Preload restoreElements before the first paint, mirroring replay
  // -----------------------------------------------------------------

  useEffect(() => {
    if (loadState.kind !== "ready") {
      setRestoreReady(false);
      return undefined;
    }
    let cancelled = false;
    void import("@excalidraw/excalidraw").then((m) => {
      restoreElementsRef.current = m.restoreElements;
      if (!cancelled) setRestoreReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadState]);

  // -----------------------------------------------------------------
  // First paint + camera fit, mirroring WhiteboardReplay's pattern.
  //
  // Reliability invariants (each one is load-bearing — earlier
  // attempts that skipped any of these reproduced as "log says
  // painted, canvas stays empty"):
  //
  //   1. Single effect (NOT useCallback + naked useEffect). The
  //      cleanup MUST own the fitter so its pending rAF retries are
  //      cancelled when this api is replaced. Without this, a
  //      remount-driven api swap leaves the previous fitter writing
  //      into a stale api while the visible new api never receives
  //      the elements + camera fit.
  //
  //   2. Re-runs on api / loadState / restoreReady change. The
  //      `initialPaintApiRef.current === api` guard prevents the
  //      same api from being painted twice; a fresh api object
  //      (Excalidraw remount) correctly re-paints into the new
  //      instance.
  //
  //   3. Calls `applyAt(finalT, { preserveScroll: false })` so the
  //      painter does NOT pull stale scroll from the empty
  //      `initialData.appState` — the camera fitter pushes the
  //      correct scrollX / scrollY immediately after.
  //
  //   4. Diagnostic logs at every transition (guards, container
  //      rect, paint, fit success, cleanup) — without these the
  //      "canvas blank" failure mode is invisible from the outside.
  //      All logs share the `[preview-before-start] pvw=… wbsid=…`
  //      prefix so a single search filters everything.
  // -----------------------------------------------------------------

  useEffect(() => {
    const pvw = pvwRef.current;
    if (loadState.kind !== "ready" || !api || !restoreReady) {
      console.log(
        `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} paint guards: load=${loadState.kind} api=${api ? "ready" : "null"} restoreReady=${restoreReady}`
      );
      return undefined;
    }
    if (initialPaintApiRef.current === api) {
      console.log(
        `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} paint skipped: same api instance`
      );
      return undefined;
    }
    initialPaintApiRef.current = api;

    const painter = createScenePainter({
      log: loadState.log,
      api,
      restoreElements: restoreElementsRef.current ?? undefined,
    });
    const finalT = Math.max(
      loadState.log.durationMs,
      maxEventTimestampMs(loadState.log)
    );
    const result = painter.applyAt(finalT, { preserveScroll: false });
    lastSceneElementsRef.current = result.paintedElements;
    console.log(
      `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} painted final frame at t=${finalT}ms elements=${result.paintedElements.length} restoreElementsAvailable=${restoreElementsRef.current ? "yes" : "no"}`
    );

    const container = containerRef.current;
    if (!container) {
      console.warn(
        `[preview-before-start] pvw=${pvw} wbsid=${whiteboardSessionId} containerRef null at fit time — skipping camera fit`
      );
      return undefined;
    }
    const fitter = createCameraFitter({
      api,
      container,
      getElements: () => lastSceneElementsRef.current,
      zoom: 1,
    });
    fitter.fit();

    // NOTE (2026-05-12, Phase 1c, Andrew smoke chain): the canvas
    // here renders blank in production for sessions with strokes,
    // even though every diagnostic above logs success — single
    // Excalidraw mount, restoreElements available, real container
    // dims, synchronous camera fit ok. Three-checkpoint state
    // probes (since trimmed) showed Excalidraw HOLDING N elements
    // synchronously after the fit, then resetting to 0 elements +
    // default scroll/zoom within one rAF. `useMemo`'d
    // `initialData` + `UIOptions` did not close the wipe.
    //
    // The wipe source is Excalidraw-internal (history init, theme
    // prop transition, or some other post-mount effect). Replay
    // tolerates the same root cause because its audio play-loop
    // re-pushes the scene every ~50ms, masking each wipe; this
    // surface is one-shot.
    //
    // Deferred to `docs/BACKLOG.md` ("Preview-before-Start canvas
    // wipe race") because: (a) the surface is reachable only via
    // pinned tab / direct URL — the notes-list / share-card flows
    // route to `/review`; (b) the user-facing escape hatches all
    // work (Start a new whiteboard session, Open full replay, Open
    // last snapshot); (c) further debugging requires opening up
    // Excalidraw internals, which is a different shape of work
    // from the rest of Phase 1c.

    return () => {
      fitter.dispose();
    };
  }, [api, loadState, restoreReady, whiteboardSessionId]);

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  const durationLabel = useMemo(
    () =>
      durationSeconds == null
        ? ""
        : formatClockDuration(durationSeconds, { padMinutes: false }),
    [durationSeconds]
  );

  return (
    <div
      style={{ display: "grid", gap: 12 }}
      data-testid="wb-preview-before-start"
    >
      <div
        className="card"
        style={{
          padding: "12px 14px",
          background: "var(--info-soft)",
          border: "1px solid var(--info-border)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          Previous whiteboard session — read-only preview
        </div>
        <p
          className="muted"
          style={{ margin: "6px 0 10px", fontSize: 13, lineHeight: 1.4 }}
        >
          This session ended on <FormattedTime iso={endedAtIso} />.
          Use <strong>Open full replay</strong> to scrub through the
          recorded session{snapshotProxyUrl
            ? <>, or <strong>Open last snapshot</strong> to see the
              final frame as a static image</>
            : null}
          . Start a new session to begin recording again — the new
          canvas will be empty.
        </p>
        <div
          className="row"
          style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <StartWhiteboardSession
            studentId={studentId}
            consentRecordExists={props.consentRecordExists}
            isSelfLearner={props.isSelfLearner}
            studentClaimed={props.studentClaimed}
          />
          <Link href={reviewHref} className="btn">
            Open full replay
          </Link>
          {snapshotProxyUrl && (
            // Promoted out of the empty/error fallback states so it's
            // ALWAYS reachable from the header — the live-canvas
            // render path has a known wipe race (see backlog
            // "Preview-before-Start canvas wipe race"); the snapshot
            // PNG is the always-works visual reminder of the final
            // frame regardless of canvas behaviour.
            <a
              href={snapshotProxyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="btn"
            >
              Open last snapshot
            </a>
          )}
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 0,
          width: "100%",
          position: "relative",
          overflow: "hidden",
        }}
        data-testid="wb-preview-canvas-mount"
      >
        {loadState.kind === "loading" && (
          <div
            style={{
              minHeight: 480,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="muted">Loading previous session…</span>
          </div>
        )}

        {loadState.kind === "error" && (
          <div
            style={{
              minHeight: 480,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 24,
              textAlign: "center",
            }}
            data-testid="wb-preview-error"
          >
            <div className="muted" style={{ fontSize: 13, maxWidth: 480 }}>
              {loadState.message} Use the “Open full replay” link above to
              try the read-only review surface, or start a new session to
              keep going.
            </div>
            {snapshotProxyUrl && (
              <a
                href={snapshotProxyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn"
              >
                Open last snapshot
              </a>
            )}
          </div>
        )}

        {loadState.kind === "empty" && (
          <div
            style={{
              minHeight: 480,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 24,
              textAlign: "center",
            }}
            data-testid="wb-preview-empty"
          >
            <div className="muted" style={{ fontSize: 13, maxWidth: 480 }}>
              Nothing was drawn during the previous session. Start a new
              session above to record some work.
            </div>
            {snapshotProxyUrl && (
              <a
                href={snapshotProxyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn"
              >
                Open last snapshot
              </a>
            )}
          </div>
        )}

        {loadState.kind === "ready" && (
          // Concrete-height container — match WhiteboardReplay.tsx
          // exactly. The earlier `flex: 1` + `style={{height:100%}}`
          // pattern was fragile: Excalidraw's internal layout reads
          // its container's measured height, and a flex child mid-
          // measure can briefly report 0×0, racing the camera fit's
          // synchronous attempt and leaving the visible canvas empty.
          //
          // We also intentionally do NOT pass `style` through to
          // Excalidraw (replay doesn't either) — the dynamic-import
          // wrapper would forward it as an extra prop Excalidraw
          // does not officially support and we've seen it interfere
          // with Excalidraw's internal sizing in past pilots.
          <div
            ref={containerRef}
            data-preview-viewport-metrics=""
            style={{
              height: "max(480px, calc(100vh - 360px))",
              minHeight: 480,
              width: "100%",
            }}
          >
            <ExcalidrawDynamic
              viewModeEnabled
              gridModeEnabled={false}
              theme={excalidrawTheme}
              name={`whiteboard-preview-${whiteboardSessionId}`}
              UIOptions={stableUIOptions}
              excalidrawAPI={(instance: unknown) => {
                apiCallbackCountRef.current += 1;
                console.log(
                  `[preview-before-start] pvw=${pvwRef.current} wbsid=${whiteboardSessionId} excalidrawAPI fired (count=${apiCallbackCountRef.current})`
                );
                setApi(instance as ScenePaintApi);
              }}
              initialData={stableInitialData}
            />
          </div>
        )}
      </div>

      <div
        className="muted"
        style={{ fontSize: 11, textAlign: "right" }}
        data-testid="wb-preview-meta"
      >
        wbsid={whiteboardSessionId.slice(0, 8)} · started{" "}
        <FormattedTime iso={startedAtIso} /> · ended{" "}
        <FormattedTime iso={endedAtIso} />
        {durationLabel ? ` · duration ${durationLabel}` : ""}
      </div>
    </div>
  );
}
