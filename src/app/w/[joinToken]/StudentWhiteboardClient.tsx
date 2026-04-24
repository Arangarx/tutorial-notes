"use client";

/**
 * Student-side live whiteboard: encryption key from hash, encrypted
 * sync to the same room as the tutor, and a real Excalidraw surface
 * so the student can draw with the tutor in real time.
 */

import { useEffect, useState } from "react";
import {
  createWhiteboardSyncClient,
  type WhiteboardSyncClient,
} from "@/lib/whiteboard/sync-client";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";
import { useStudentWhiteboardCanvas } from "@/hooks/useStudentWhiteboardCanvas";
import { UndoRedoButtons } from "@/components/whiteboard/UndoRedoButtons";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";

type Props = {
  whiteboardSessionId: string;
  syncUrl: string;
  tutorName: string;
};

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

  const { onCanvasChange } = useStudentWhiteboardCanvas(
    syncClient,
    excalidrawAPI
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
        </div>
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
      </div>

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
          height: "calc(100vh - 260px)",
          minHeight: 420,
        }}
      >
        <ExcalidrawDynamic
          onChange={onCanvasChange}
          excalidrawAPI={(api: unknown) => {
            setExcalidrawAPI(api as ExcalidrawApiLike);
          }}
          UIOptions={{ canvasActions: { saveToActiveFile: false } }}
          validateEmbeddable={validateExcalidrawEmbeddable}
        />
      </div>
    </div>
  );
}
