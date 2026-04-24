"use client";

/**
 * Student-side live whiteboard: encryption key from hash, encrypted
 * sync to the same room as the tutor, and a real Excalidraw surface
 * so the student can draw with the tutor in real time.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWindowScrollToTopOnMount } from "@/hooks/useWindowScrollToTopOnMount";
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

type Props = {
  whiteboardSessionId: string;
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
  syncUrl,
  tutorName,
}: Props) {
  const params = useParams<{ joinToken: string }>();
  const joinToken =
    typeof params?.joinToken === "string" ? params.joinToken : "";

  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [syncClient, setSyncClient] = useState<WhiteboardSyncClient | null>(
    null
  );
  const [connected, setConnected] = useState(false);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawApiLike | null>(
    null
  );
  const [otherPeerCount, setOtherPeerCount] = useState(0);
  const [serverActiveMs, setServerActiveMs] = useState(0);
  const [serverLastActiveAtMs, setServerLastActiveAtMs] = useState<
    number | null
  >(null);
  const [now, setNow] = useState(() => Date.now());

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
    if (!joinToken) return;
    const refresh = async () => {
      try {
        const res = await fetch(
          `/api/whiteboard/${encodeURIComponent(whiteboardSessionId)}/join-timer?token=${encodeURIComponent(joinToken)}`,
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
  }, [joinToken, whiteboardSessionId]);

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

  const { onCanvasChange } = useStudentWhiteboardCanvas(
    syncClient,
    excalidrawAPI,
    onRemoteHydrateResult
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
      </div>

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
            onChange={onCanvasChange}
            excalidrawAPI={(api: unknown) => {
              setExcalidrawAPI(api as ExcalidrawApiLike);
            }}
            theme="dark"
            UIOptions={{ canvasActions: { saveToActiveFile: false } }}
            validateEmbeddable={validateExcalidrawEmbeddable}
          />
        </div>
      </div>
    </div>
  );
}
