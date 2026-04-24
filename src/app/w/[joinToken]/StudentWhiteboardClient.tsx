"use client";

/**
 * Student-side live whiteboard bootstrap.
 *
 * Responsibilities:
 *   1. Read the AES-GCM encryption key from `window.location.hash`
 *      (`#k=<base64url>`). NEVER log or echo this value.
 *   2. Spin up a sync client (`createWhiteboardSyncClient`) with the
 *      session id as the room id. The sync client never sees the URL
 *      fragment server-side because the page boundary is pure client
 *      from this component down.
 *   3. Render a connection-status pill so the student can tell at a
 *      glance whether the link is live.
 *   4. Provide a placeholder mount point for the live Excalidraw
 *      canvas. The actual canvas component is built as part of the
 *      workspace todo (`phase1-workspace`); when that lands, both
 *      this page and the tutor workspace will import the same
 *      `<WhiteboardLiveCanvas />` from `src/components/whiteboard/`.
 *      Until then this surface is intentionally minimal — better an
 *      honest "joining…" screen than a half-wired canvas the student
 *      could draw on without the tutor seeing it.
 *
 * Why a separate file from the page:
 *   The Next.js page is a server component (we want notFound() +
 *   server-side token validation). The sync-client + window.hash +
 *   useEffect work has to be client-rendered. Splitting keeps the
 *   trust boundary obvious — server code cannot accidentally touch
 *   the encryption key, and client code cannot accidentally touch
 *   the database.
 */

import { useEffect, useRef, useState } from "react";
import {
  createWhiteboardSyncClient,
  type WhiteboardSyncClient,
} from "@/lib/whiteboard/sync-client";

type Props = {
  whiteboardSessionId: string;
  syncUrl: string;
  tutorName: string;
};

function readKeyFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;
  // Hash is `#k=...` or `#k=...&other=...` etc. Parse k/v pairs.
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const k = params.get("k");
  return k && k.length >= 16 ? k : null;
}

export function StudentWhiteboardClient({
  whiteboardSessionId,
  syncUrl,
  tutorName,
}: Props) {
  const clientRef = useRef<WhiteboardSyncClient | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);

  // Step 1: pull the encryption key out of the URL fragment exactly
  // once after mount. Doing this in useEffect (not during render)
  // guarantees we're on the client and `window` is defined.
  useEffect(() => {
    const k = readKeyFromHash();
    if (!k) {
      setKeyMissing(true);
      return;
    }
    setEncryptionKey(k);
  }, []);

  // Step 2: bootstrap the sync client when we have the key. We mount
  // the sync client AT MOST ONCE per `whiteboardSessionId + key`
  // pair; the cleanup function tears it down on unmount or when
  // either input changes.
  useEffect(() => {
    if (!encryptionKey) return;
    const client = createWhiteboardSyncClient({
      url: syncUrl,
      roomId: whiteboardSessionId,
      encryptionKeyBase64Url: encryptionKey,
      role: "student",
    });
    clientRef.current = client;
    setConnected(client.isConnected());
    const offConnect = client.onConnect(() => setConnected(true));
    const offDisconnect = client.onDisconnect(() => setConnected(false));
    return () => {
      offConnect();
      offDisconnect();
      client.disconnect();
      clientRef.current = null;
    };
  }, [encryptionKey, syncUrl, whiteboardSessionId]);

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
            The part after <code>#</code> is required and never gets sent
            to the server, so it can&apos;t be recovered.
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
            This session is being recorded by your tutor. Anything you draw
            will be visible live.
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

      {/* Placeholder mount for the live Excalidraw canvas. Replaced
          with <WhiteboardLiveCanvas client={clientRef.current} /> in
          the workspace todo. */}
      <div
        className="card"
        data-testid="student-whiteboard-canvas-mount"
        style={{
          marginTop: 12,
          minHeight: 480,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <div className="muted">
          {connected
            ? "Connected. The live drawing surface is loading…"
            : "Waiting to connect to the whiteboard server…"}
        </div>
      </div>
    </div>
  );
}
