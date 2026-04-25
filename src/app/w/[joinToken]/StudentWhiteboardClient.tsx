"use client";

/**
 * Student-side live whiteboard: encryption key from hash, encrypted
 * sync to the same room as the tutor, and a real Excalidraw surface
 * so the student can draw with the tutor in real time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowScrollToTopOnMount } from "@/hooks/useWindowScrollToTopOnMount";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";
import { useParams } from "next/navigation";
import {
  createWhiteboardSyncClient,
  type WhiteboardSyncClient,
} from "@/lib/whiteboard/sync-client";
import {
  ACTIVE_PING_STALE_MS,
  computeDisplayActiveMs,
} from "@/lib/whiteboard/active-time";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";
import { useStudentWhiteboardCanvas } from "@/hooks/useStudentWhiteboardCanvas";
import { UndoRedoButtons } from "@/components/whiteboard/UndoRedoButtons";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { HydrateRemoteImageFilesResult } from "@/lib/whiteboard/hydrate-remote-files";
import { ensureNativeImageAssetUrlsForSync } from "@/lib/whiteboard/ensure-native-image-asset-urls-for-sync";
import type { BinaryFileFromExcalidraw } from "@/lib/whiteboard/ensure-native-image-asset-urls-for-sync";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

type Props = {
  whiteboardSessionId: string;
  /** For namespaced Vercel Blob paths + native image upload (paste/drop). */
  studentId: string;
  joinToken: string;
  syncUrl: string;
  tutorName: string;
};

function formatSessionDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function readKeyFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;
  const params = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash
  );
  const k = params.get("k");
  return k && k.length >= 16 ? k : null;
}

export function StudentWhiteboardClient({
  whiteboardSessionId,
  studentId,
  joinToken: joinTokenFromServer,
  syncUrl,
  tutorName,
}: Props) {
  const params = useParams<{ joinToken: string }>();
  const joinToken =
    typeof params?.joinToken === "string" ? params.joinToken : "";
  const pathJoinToken = joinToken || joinTokenFromServer;

  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [syncClient, setSyncClient] = useState<WhiteboardSyncClient | null>(
    null
  );
  const [connected, setConnected] = useState(false);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawApiLike | null>(
    null
  );
  const excalidrawAPIRef = useRef<ExcalidrawApiLike | null>(null);
  const [otherPeerCount, setOtherPeerCount] = useState(0);
  const [serverActiveMs, setServerActiveMs] = useState(0);
  const [serverLastActiveAtMs, setServerLastActiveAtMs] = useState<
    number | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  const excalidrawTheme = useExcalidrawThemeFromSystem();

  useWindowScrollToTopOnMount();

  useEffect(() => {
    const k = readKeyFromHash();
    if (!k) {
      setKeyMissing(true);
      return;
    }
    setEncryptionKey(k);
  }, []);

  useEffect(() => {
    if (!encryptionKey) return;
    const client = createWhiteboardSyncClient({
      url: syncUrl,
      roomId: whiteboardSessionId,
      encryptionKeyBase64Url: encryptionKey,
      role: "student",
    });
    setSyncClient(client);
    setConnected(client.isConnected());
    const offConnect = client.onConnect(() => setConnected(true));
    const offDisconnect = client.onDisconnect(() => setConnected(false));
    const offPeers = client.onPeerCountChange((n) => setOtherPeerCount(n));
    return () => {
      offConnect();
      offDisconnect();
      offPeers();
      client.disconnect();
      setSyncClient(null);
      setConnected(false);
    };
  }, [encryptionKey, syncUrl, whiteboardSessionId]);

  const bothPresent = connected && otherPeerCount >= 1;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pathJoinToken) return;
    const refresh = async () => {
      try {
        const res = await fetch(
          `/api/whiteboard/${encodeURIComponent(whiteboardSessionId)}/join-timer?token=${encodeURIComponent(pathJoinToken)}`,
          { cache: "no-store" }
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
        // ignore; next tick retries
      }
    };
    void refresh();
    const POLL_MS = 10_000;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [pathJoinToken, whiteboardSessionId]);

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

  const showWaitingForOther =
    serverActiveMs === 0 && !bothPresent && connected;

  const [materialNotice, setMaterialNotice] = useState<
    "none" | "load" | "missing"
  >("none");
  const [dismissedMaterialNotice, setDismissedMaterialNotice] = useState(false);
  const [dismissedBoardWaitNotice, setDismissedBoardWaitNotice] = useState(false);
  const [boardWaitElapsed, setBoardWaitElapsed] = useState(false);

  const studentNativeImageFileIdToAssetUrlRef = useRef(new Map<string, string>());
  const studentNativeImageUploadInFlightRef = useRef(new Set<string>());

  const onRemoteHydrateResult = useCallback(
    (result: HydrateRemoteImageFilesResult) => {
      if (result.fetchFailed.length > 0) {
        setMaterialNotice("load");
        setDismissedMaterialNotice(false);
        return;
      }
      if (result.missingAssetUrlFileIds.length > 0) {
        setMaterialNotice((prev) => (prev === "load" ? "load" : "missing"));
        setDismissedMaterialNotice(false);
      }
    },
    []
  );

  const [independentView, setIndependentView] = useState(true);

  const {
    onCanvasChange: studentSyncOnCanvas,
    snapToTutorView,
    getPageBroadcastExtras,
    pageList,
    activePageId: studentActivePageId,
    tutorStreamReady,
  } = useStudentWhiteboardCanvas(
    syncClient,
    excalidrawAPI,
    onRemoteHydrateResult,
    {
      joinToken: pathJoinToken,
      followTutorView: !independentView,
    }
  );

  useEffect(() => {
    if (!connected || otherPeerCount < 1) {
      setBoardWaitElapsed(false);
      return;
    }
    if (tutorStreamReady) {
      setBoardWaitElapsed(false);
      return;
    }
    const t = window.setTimeout(() => setBoardWaitElapsed(true), 8000);
    return () => clearTimeout(t);
  }, [connected, otherPeerCount, tutorStreamReady]);

  const handleExcalidrawChange = useCallback(
    (
      elements: ReadonlyArray<unknown>,
      _appState?: unknown,
      files?: Readonly<Record<string, unknown>>
    ) => {
      studentSyncOnCanvas(elements, _appState, files);
      if (!pathJoinToken) return;
      void (async () => {
        try {
          const api = excalidrawAPIRef.current;
          if (!api) return;
          const getFiles = (): Record<string, BinaryFileFromExcalidraw> => {
            const raw = api.getFiles?.();
            return raw && typeof raw === "object"
              ? (raw as Record<string, BinaryFileFromExcalidraw>)
              : {};
          };
          const patched = await ensureNativeImageAssetUrlsForSync({
            elements,
            files: files as
              | Record<string, BinaryFileFromExcalidraw>
              | undefined,
            getFiles,
            whiteboardSessionId,
            studentId,
            joinToken: pathJoinToken,
            fileIdToAssetUrl: studentNativeImageFileIdToAssetUrlRef.current,
            inFlight: studentNativeImageUploadInFlightRef.current,
          });
            if (patched) {
            const live = excalidrawAPIRef.current;
            if (live) {
              live.updateScene({ elements: patched });
              syncClient?.broadcastScene(
                patched as ReadonlyArray<ExcalidrawLikeElement>,
                getPageBroadcastExtras()
              );
            }
          }
        } catch (err) {
          console.warn(
            "[StudentWhiteboardClient] native image asset back-fill failed:",
            (err as Error)?.message ?? String(err)
          );
        }
      })();
    },
    [studentSyncOnCanvas, whiteboardSessionId, studentId, pathJoinToken, syncClient, getPageBroadcastExtras]
  );

  if (keyMissing) {
    return (
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Whiteboard link is incomplete</h1>
          <p>
            This link is missing the encryption key needed to join the
            whiteboard. Please ask {tutorName} for a fresh link.
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            Whiteboard links look like
            <code style={{ marginLeft: 6 }}>/w/&lt;token&gt;#k=&lt;key&gt;</code>.
            The part after <code>#</code> is required and never gets sent to
            the server, so it can&apos;t be recovered.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 1200 }}>
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Whiteboard with {tutorName}</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            This session is being recorded by your tutor. What you draw is
            visible live.{" "}
            {otherPeerCount === 0
              ? "Waiting for others to join this room (besides you)."
              : `Others in this room (not counting you): ${otherPeerCount}.`}
          </p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 12, maxWidth: 640 }}>
            Worksheets and images your tutor insert from the toolbar should
            appear here. If something is missing, check your connection, refresh
            the page, or ask your tutor to re-insert the page.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div
            aria-live="polite"
            aria-label={connected ? "Connected" : "Connecting"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: connected
                ? "rgba(34,197,94,0.18)"
                : "rgba(234,179,8,0.18)",
              color: connected ? "#16a34a" : "#a16207",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: connected ? "#16a34a" : "#ca8a04",
              }}
            />
            {connected ? "Connected" : "Joining…"}
          </div>
          <div
            aria-label="Session time"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: "rgba(59,130,246,0.15)",
              color: "#2563eb",
            }}
          >
            {showWaitingForOther
              ? `Session: ${formatSessionDuration(liveTimerMs)} (waiting)`
              : `Session: ${formatSessionDuration(liveTimerMs)}`}
          </div>
        </div>
        <div
          style={{
            width: "100%",
            flexBasis: "100%",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          <label
            style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={!independentView}
              onChange={(e) => setIndependentView(!e.target.checked)}
            />
            Keep pan &amp; zoom synced to tutor
          </label>
          <button
            type="button"
            onClick={() => snapToTutorView()}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid rgba(148,163,184,0.5)",
              background: "rgba(15,23,42,0.04)",
              cursor: "pointer",
            }}
          >
            Match tutor’s view now
          </button>
        </div>
      </div>

      <div
        className="card"
        data-testid="student-board-pages-strip"
        style={{
          marginTop: 4,
          padding: "10px 14px",
          background: "rgba(16, 185, 129, 0.06)",
          border: "1px solid rgba(16, 185, 129, 0.22)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.01em",
          }}
        >
          Board pages
        </div>
        <p
          className="muted"
          style={{ margin: "6px 0 8px", fontSize: 12, lineHeight: 1.45, maxWidth: 720 }}
        >
          These tabs mirror your tutor’s board. The highlighted page is the one
          you’re working on; your lines stay on that page and won’t overwrite the
          tutor’s other tabs.
        </p>
        <div
          className="row"
          style={{ flexWrap: "wrap", gap: 6, alignItems: "center" }}
        >
          {pageList.map((p) => (
            <span
              key={p.id}
              className="btn"
              style={{
                display: "inline-block",
                pointerEvents: "none",
                opacity: p.id === studentActivePageId ? 1 : 0.75,
                fontWeight: p.id === studentActivePageId ? 700 : 400,
                borderWidth: p.id === studentActivePageId ? 2 : 1,
                borderColor: "var(--border-strong, #999)",
                cursor: "default",
              }}
              aria-current={p.id === studentActivePageId ? "true" : undefined}
            >
              {p.title}
            </span>
          ))}
        </div>
      </div>

      {boardWaitElapsed && !dismissedBoardWaitNotice && (
        <div
          role="status"
          className="card"
          data-testid="student-board-sync-wait-banner"
          style={{
            marginTop: 10,
            padding: "10px 14px",
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, maxWidth: 720 }}>
            The board is still empty after several seconds. That usually means
            the live link didn&apos;t resync (for example, after a refresh). Try
            reload — or ask your tutor to draw or switch a page, which
            re-sends the full board.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              onClick={() => window.location.reload()}
            >
              Reload this page
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setDismissedBoardWaitNotice(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {materialNotice !== "none" && !dismissedMaterialNotice && (
        <div
          role="status"
          className="card"
          data-testid="student-material-safeguards-banner"
          style={{
            marginTop: 10,
            padding: "10px 14px",
            background: "rgba(234,179,8,0.12)",
            border: "1px solid rgba(234,179,8,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13 }}>
            {materialNotice === "load" ? (
              <>
                We couldn&apos;t load a worksheet or image. Check your network,
                try refreshing the page, or ask your tutor to re-insert the file
                from the PDF/image buttons.
              </>
            ) : (
              <>
                A drawing on the board can&apos;t be shared with a file link
                (for example, a pasted image). Ask your tutor to add the
                material using the insert buttons so you both see the same
                thing.
              </>
            )}
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setDismissedMaterialNotice(true)}
            aria-label="Dismiss notice"
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className="row"
        style={{ marginTop: 8, flexWrap: "wrap", gap: 8, alignItems: "center" }}
      >
        <UndoRedoButtons disabled={!connected} />
      </div>

      <div
        className="card"
        data-testid="student-whiteboard-canvas-mount"
        style={{
          marginTop: 12,
          padding: 0,
          minHeight: 420,
          height: "max(420px, calc(100vh - 260px))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 360,
            width: "100%",
            position: "relative",
          }}
        >
          <ExcalidrawDynamic
            style={{ width: "100%", height: "100%" }}
            onChange={handleExcalidrawChange}
            excalidrawAPI={(api: unknown) => {
              const like = api as ExcalidrawApiLike;
              excalidrawAPIRef.current = like;
              setExcalidrawAPI(like);
            }}
            theme={excalidrawTheme}
            UIOptions={{
              canvasActions: { saveToActiveFile: false, loadScene: false },
            }}
            validateEmbeddable={validateExcalidrawEmbeddable}
          />
        </div>
      </div>
    </div>
  );
}
