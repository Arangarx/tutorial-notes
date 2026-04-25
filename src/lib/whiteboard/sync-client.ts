"use client";

/**
 * Whiteboard live-sync client — the bridge between the tutor's
 * workspace and the student's share page over our self-hosted
 * `excalidraw-room` (socket.io) relay at `WHITEBOARD_SYNC_URL`.
 *
 * Trust model (re-read this before changing anything):
 *
 *   - The relay sees only opaque encrypted bytes. AES-GCM-256 with a
 *     32-byte key passed in the URL fragment (`#k=...`) of the join
 *     link. Fragments are never sent in HTTP requests — even if our
 *     server is compromised, the key never reaches it. Same model
 *     Excalidraw uses for excalidraw.com itself.
 *
 *   - A relay compromise can: drop messages, take down live collab,
 *     observe traffic patterns. It cannot: read scene contents,
 *     forge legitimate scene updates (decryption fails on tampered
 *     payload via the GCM auth tag).
 *
 *   - Recording is independent of sync. If the relay is down the
 *     tutor still records normally; `sync-disconnect` markers land
 *     in the event log so post-hoc replay can show what happened.
 *
 * Wire protocol (compatible with upstream `excalidraw-room`):
 *
 *   client → server:
 *     - `join-room`          (roomId)
 *     - `server-broadcast`   (roomId, encryptedBytes, iv)
 *     - `disconnect`         (no payload)
 *
 *   server → client:
 *     - `init-room`          fired right after join
 *     - `first-in-room`      we are alone in the room
 *     - `new-user`           (peerSocketId) — someone else joined
 *     - `room-user-change`   (string[]) — current member list
 *     - `client-broadcast`   (encryptedBytes, iv)
 *
 * The room id and encryption key are generated once when the tutor
 * issues a join token (server action, separate todo). Both the
 * student URL and the tutor's workspace receive the same pair.
 *
 * Tests: `src/__tests__/whiteboard/sync-client.test.ts` (jsdom).
 */

import { io, type Socket } from "socket.io-client";
import type { ExcalidrawLikeElement } from "./excalidraw-adapter";

// -----------------------------------------------------------------
// Wire message — what we encrypt and send
// -----------------------------------------------------------------

/**
 * Decrypted wire payload. Kept intentionally small and stable: the
 * recorder + replay only care about the canonical scene snapshot;
 * the relay forwards opaque bytes so it does not constrain this
 * shape at all.
 */
export type WhiteboardWireMessage = {
  /** Schema version — bump and branch on read if we ever evolve this. */
  v: 1;
  /** Stable peer id (NOT the socket id) so reconnects keep attribution. */
  peerId: string;
  /** Author label for UI ("Tutor" / "Student"). */
  role: "tutor" | "student";
  /** Canonical scene snapshot — receiver runs the diff itself. */
  elements: ExcalidrawLikeElement[];
};

/** Tutor camera + zoom for peer “follow me” (wire v2). */
export type WhiteboardWireFollow = {
  scrollX: number;
  scrollY: number;
  /** Excalidraw stores zoom in appState as `{ value: number }` — we send the scalar. */
  zoom: number;
};

/** Page tabs: tutor’s active list + which tab is on screen. */
export type WhiteboardWirePage = {
  activePageId: string;
  pageList: { id: string; title: string }[];
};

/**
 * Follow + page UI + which page the `elements` snapshot is for.
 * `scenePageId` can differ from `page.activePageId` when the scene
 * diff is throttled behind a tab switch — receivers must merge
 * `elements` into `scenePageId`, not the tutor’s current tab alone.
 */
export type WhiteboardDocumentWireV3 = {
  rev: number;
  pages: Readonly<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>;
};

export type WhiteboardWireRemoteDetails = {
  follow?: WhiteboardWireFollow;
  page?: WhiteboardWirePage;
  scenePageId?: string;
  /** v3: apply this instead of the single `elements` array. */
  document?: WhiteboardDocumentWireV3;
};

/**
 * v2: optional `follow` + `page` — backward compatible: old clients
 * only understand `elements` (treat v2 as v1 for scene).
 */
export type WhiteboardWireMessageV2 = {
  v: 2;
  peerId: string;
  role: "tutor" | "student";
  elements: ExcalidrawLikeElement[];
  follow?: WhiteboardWireFollow;
  page?: WhiteboardWirePage;
  /** Page the `elements` array belongs to (may lag `page.activePageId`). */
  scenePageId?: string;
};

/**
 * v3: one authoritative **multi-page document** per message. The tutor (and
 * optionally other peers) sends the full per-tab `pages` map with a
 * monotonic `rev` so clients can drop stale reordered packets. This replaces
 * the v2 pattern of a single `elements[]` + `scenePageId` (fragile for
 * multi-tab, single-slot throttling, and out-of-order follow vs merge).
 */
export type WhiteboardWireMessageV3 = {
  v: 3;
  peerId: string;
  role: "tutor" | "student";
  /** Increments on every v3 document send from that peer. */
  rev: number;
  /** All board tabs → scene elements (ids are tab ids, e.g. p1, p2). */
  pages: Record<string, ExcalidrawLikeElement[]>;
  page: WhiteboardWirePage;
  follow?: WhiteboardWireFollow;
};

export type AnyWhiteboardWireMessage =
  | WhiteboardWireMessage
  | WhiteboardWireMessageV2
  | WhiteboardWireMessageV3;

/** Extras attached to each `broadcastScene` (throttled on the tutor). */
export type WhiteboardWireBroadcastExtras = {
  follow?: WhiteboardWireFollow;
  page?: WhiteboardWirePage;
  scenePageId?: string;
};

// -----------------------------------------------------------------
// Public API
// -----------------------------------------------------------------

export type WhiteboardSyncClientOptions = {
  /** Sync host base URL — `wss://wb.mortensenapps.com` (or local). */
  url: string;
  /**
   * Room id — random, server-server visible. Generated alongside the
   * encryption key by the join-token server action.
   */
  roomId: string;
  /**
   * Base64url-encoded 32-byte AES-GCM key. The relay never sees this;
   * it lives in the URL fragment of the student join link.
   */
  encryptionKeyBase64Url: string;
  /** Author label — see WhiteboardWireMessage.role. */
  role: "tutor" | "student";
  /** Stable peer id across reconnects. Defaults to a random uuid. */
  peerId?: string;
  /**
   * Outbound throttle. We coalesce broadcastScene() calls to at most
   * one wire message per `broadcastIntervalMs` (trailing-edge). 50 ms
   * is the same cadence Excalidraw's own collab client uses.
   */
  broadcastIntervalMs?: number;
  /**
   * For tests: inject a fake `io()` constructor. Production callers
   * leave this undefined.
   */
  _ioFactory?: typeof io;
  /**
   * Optional logger override; defaults to console.* with a wbsync= prefix.
   */
  _logger?: {
    log: (msg: string, ...rest: unknown[]) => void;
    warn: (msg: string, ...rest: unknown[]) => void;
    error: (msg: string, ...rest: unknown[]) => void;
  };
  /**
   * Tutor only: a second peer (usually the student) just joined. Use this to
   * drain the on-canvas throttled `broadcastScene` queue and re-snapshot the
   * *visible* page so the welcome packet matches `activePageId` and is not
   * still held at 50ms throttle — otherwise a reload/new tab can be blank
   * until the next stroke.
   */
  onNewRemotePeer?: () => void | Promise<void>;
};

export type WhiteboardSyncClient = {
  /** True after the WS handshake completes. */
  isConnected: () => boolean;
  /** Subscribe to peer scene updates. Returns an unsubscriber. */
  onRemoteScene: (
    cb: (
      peerId: string,
      elements: ReadonlyArray<ExcalidrawLikeElement>,
      details?: WhiteboardWireRemoteDetails
    ) => void
  ) => () => void;
  /** Subscribe to "I am now connected" notifications. */
  onConnect: (cb: () => void) => () => void;
  /** Subscribe to "I just disconnected" notifications. */
  onDisconnect: (cb: () => void) => () => void;
  /**
   * Subscribe to changes in the number of OTHER peers in the room
   * (i.e. excludes our own socket). `count >= 1` means at least one
   * other party (typically the student) is connected to the relay
   * and sharing the room with us.
   *
   * Implementation note: excalidraw-room delivers the FULL members
   * list on `room-user-change`. We subtract self before exposing the
   * count; see the room-user-change handler in this file for the
   * regression context (Sarah-pilot Apr 24 2026).
   */
  onPeerCountChange: (cb: (count: number) => void) => () => void;
  /**
   * Queue an outbound scene broadcast. Throttled internally —
   * callers can fire on every diff without measuring.
   */
  broadcastScene: (
    elements: ReadonlyArray<ExcalidrawLikeElement>,
    extras?: WhiteboardWireBroadcastExtras
  ) => void;
  /**
   * Tutor: queue a **full multi-page** document (v3 wire). One payload carries
   * every tab’s elements — not subject to the v2 one-scene+scenePageId split.
   * Throttled like `broadcastScene` (one pending slot, whole board).
   */
  broadcastDocument: (doc: {
    rev: number;
    pages: Record<string, ExcalidrawLikeElement[]>;
    page: WhiteboardWirePage;
    follow?: WhiteboardWireFollow;
  }) => void;
  /**
   * Send any pending `broadcastScene` or `broadcastDocument` immediately
   * instead of waiting for the trailing-edge timer.
   */
  flushPendingBroadcast: () => boolean;
  /** Tear down the WS, drop subscriptions. Idempotent. */
  disconnect: () => void;
};

// -----------------------------------------------------------------
// Crypto helpers — AES-GCM-256 via WebCrypto
// -----------------------------------------------------------------

/**
 * Decode a base64url string (no padding, `-`/`_` alphabet) into bytes.
 *
 * We accept padded base64 too because some hand-crafted dev keys
 * arrive with `=` padding from older tooling.
 */
export function decodeBase64Url(input: string): Uint8Array {
  // Normalise to standard base64
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  if (typeof atob === "function") {
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  // Node fallback
  const buf = Buffer.from(s, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Generate a fresh 32-byte AES-GCM key as base64url for a join link. */
export function generateEncryptionKeyBase64Url(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.length !== 32) {
    throw new Error(
      `[sync-client] expected 32-byte AES-GCM key, got ${rawKey.length}`
    );
  }
  // Copy into a fresh ArrayBuffer to satisfy TS 5.7's strict
  // BufferSource typing (rawKey may be backed by a SharedArrayBuffer).
  const keyBuf = new ArrayBuffer(rawKey.length);
  new Uint8Array(keyBuf).set(rawKey);
  return crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMessage(
  key: CryptoKey,
  msg: AnyWhiteboardWireMessage
): Promise<{ data: ArrayBuffer; iv: ArrayBuffer }> {
  // Allocate the IV inside an ArrayBuffer so the lib.dom typings line
  // up with `BufferSource` exactly (TS 5.7+ disambiguates SharedArrayBuffer).
  const ivBuf = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuf);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(msg));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuf },
    key,
    plaintext as unknown as ArrayBuffer
  );
  return { data: ct, iv: ivBuf };
}

function toArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  // Copy the view into a fresh ArrayBuffer to satisfy strict BufferSource
  // typing (the source might be backed by a SharedArrayBuffer).
  const out = new ArrayBuffer(input.byteLength);
  new Uint8Array(out).set(input);
  return out;
}

function validateWireMessage(parsed: unknown): AnyWhiteboardWireMessage {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("[sync-client] decoded payload: not an object");
  }
  const v = (parsed as { v?: unknown }).v;
  if (v === 3) {
    const p = parsed as WhiteboardWireMessageV3;
    if (typeof p.peerId !== "string" || (p.role !== "tutor" && p.role !== "student")) {
      throw new Error("[sync-client] decoded payload v3: bad peerId/role");
    }
    if (typeof p.rev !== "number" || !Number.isFinite(p.rev) || p.rev < 0) {
      throw new Error("[sync-client] decoded payload v3: bad rev");
    }
    if (
      !p.page ||
      typeof p.page.activePageId !== "string" ||
      !Array.isArray(p.page.pageList)
    ) {
      throw new Error("[sync-client] decoded payload v3: bad page");
    }
    if (!p.pages || typeof p.pages !== "object") {
      throw new Error("[sync-client] decoded payload v3: bad pages");
    }
    for (const [pid, els] of Object.entries(p.pages)) {
      if (typeof pid !== "string" || !Array.isArray(els)) {
        throw new Error(`[sync-client] decoded payload v3: bad pages.${pid}`);
      }
    }
    return p;
  }
  if (v !== 1 && v !== 2) {
    throw new Error("[sync-client] decoded payload: bad v");
  }
  if (typeof (parsed as { peerId?: unknown }).peerId !== "string") {
    throw new Error("[sync-client] decoded payload: bad peerId");
  }
  if (!Array.isArray((parsed as { elements?: unknown }).elements)) {
    throw new Error("[sync-client] decoded payload: bad elements");
  }
  if (v === 2) {
    return parsed as WhiteboardWireMessageV2;
  }
  return parsed as WhiteboardWireMessage;
}

async function decryptMessage(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array,
  iv: ArrayBuffer | Uint8Array
): Promise<AnyWhiteboardWireMessage> {
  const ivBytes = toArrayBuffer(iv);
  const ctBytes = toArrayBuffer(data);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    ctBytes
  );
  const json = new TextDecoder().decode(pt);
  const parsed = JSON.parse(json) as unknown;
  return validateWireMessage(parsed);
}

// -----------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------

function makeRandomPeerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fallthrough
    }
  }
  return `peer_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

const DEFAULT_BROADCAST_INTERVAL_MS = 50;

export function createWhiteboardSyncClient(
  opts: WhiteboardSyncClientOptions
): WhiteboardSyncClient {
  const {
    url,
    roomId,
    encryptionKeyBase64Url,
    role,
    broadcastIntervalMs = DEFAULT_BROADCAST_INTERVAL_MS,
    _ioFactory,
    _logger,
    onNewRemotePeer,
  } = opts;
  const peerId = opts.peerId ?? makeRandomPeerId();

  const log = _logger ?? {
    log: (msg: string, ...rest: unknown[]) =>
      console.log(`[sync-client] wbsync=${roomId.slice(0, 8)} ${msg}`, ...rest),
    warn: (msg: string, ...rest: unknown[]) =>
      console.warn(`[sync-client] wbsync=${roomId.slice(0, 8)} ${msg}`, ...rest),
    error: (msg: string, ...rest: unknown[]) =>
      console.error(`[sync-client] wbsync=${roomId.slice(0, 8)} ${msg}`, ...rest),
  };

  // ---------------------------------------------------------------
  // Subscribers
  // ---------------------------------------------------------------

  type RemoteSceneCb = (
    peerId: string,
    elements: ReadonlyArray<ExcalidrawLikeElement>,
    details?: WhiteboardWireRemoteDetails
  ) => void;
  const remoteSceneSubs = new Set<RemoteSceneCb>();
  const connectSubs = new Set<() => void>();
  const disconnectSubs = new Set<() => void>();
  const peerCountSubs = new Set<(count: number) => void>();

  /**
   * Ingest can race AES key import (async IIFE). Dropping a packet here
   * loses the tutor's new-user re-broadcast — student shows Connected but
   * blank until the next stroke. Queue until the key is ready.
   */
  type QueuedClientBroadcast = { data: ArrayBuffer; iv: ArrayBuffer };
  const MAX_PENDING_CLIENT_BROADCASTS = 20;
  const pendingClientBroadcasts: QueuedClientBroadcast[] = [];

  /**
   * The relay may deliver a full scene before React subscribes to
   * onRemoteScene (useEffect after paint). Cache the latest decrypted
   * remote message so a late subscriber still receives a snapshot once.
   */
  type LastRemoteSceneSnapshot = {
    peerId: string;
    elements: ReadonlyArray<ExcalidrawLikeElement>;
    details?: WhiteboardWireRemoteDetails;
  };
  let lastRemoteScene: LastRemoteSceneSnapshot | null = null;

  function fan<T extends (...args: never[]) => void>(
    set: Set<T>,
    ...args: Parameters<T>
  ) {
    for (const cb of set) {
      try {
        // T is constrained to (...args: never[]) => void so this cast is sound:
        // we erase the never[] for the call site, but every subscriber was
        // registered with a matching signature when the Set was typed.
        (cb as (...a: Parameters<T>) => void)(...args);
      } catch (err) {
        log.warn("subscriber threw:", (err as Error)?.message ?? String(err));
      }
    }
  }

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------

  let connected = false;
  let disposed = false;
  let socket: Socket | null = null;
  let aesKey: CryptoKey | null = null;
  let aesKeyError: string | null = null;
  type PendingPayload =
    | {
        kind: "v2";
        elements: ExcalidrawLikeElement[];
        extras?: WhiteboardWireBroadcastExtras;
      }
    | {
        kind: "v3";
        doc: {
          rev: number;
          pages: Record<string, ExcalidrawLikeElement[]>;
          page: WhiteboardWirePage;
          follow?: WhiteboardWireFollow;
        };
      };
  let pendingPayload: PendingPayload | null = null;
  // Cache the most recent scene we broadcast so that when a new
  // peer joins after the tutor has been drawing for a while, we can
  // immediately re-broadcast the current state. Without this the
  // student would see a blank canvas until the tutor's next stroke.
  let lastBroadcastPayload: PendingPayload | null = null;
  let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  // Serialise outbound encrypts so two rapid changes don't race a
  // GCM IV reuse situation (different IV per call so safe, but we
  // still want strict ordering on the wire).
  let outboundChain: Promise<unknown> = Promise.resolve();

  // ---------------------------------------------------------------
  // Crypto bootstrap (best-effort; failure leaves us in a degraded
  // mode where we never send/receive but the recorder still works.)
  // ---------------------------------------------------------------

  function handleDecryptedWireMessage(msg: AnyWhiteboardWireMessage): void {
    if (msg.peerId === peerId) return;
    if (msg.v === 3) {
      const m = msg as WhiteboardWireMessageV3;
      const details: WhiteboardWireRemoteDetails = {
        follow: m.follow,
        page: m.page,
        document: { rev: m.rev, pages: m.pages },
      };
      lastRemoteScene = { peerId: m.peerId, elements: [], details };
      fan(remoteSceneSubs, m.peerId, [], details);
      return;
    }
    const details: WhiteboardWireRemoteDetails = {};
    if (msg.v === 2) {
      if (msg.follow) details.follow = msg.follow;
      if (msg.page) details.page = msg.page;
      if (typeof (msg as WhiteboardWireMessageV2).scenePageId === "string") {
        details.scenePageId = (msg as WhiteboardWireMessageV2).scenePageId;
      }
    }
    const has = Object.keys(details).length > 0;
    lastRemoteScene = {
      peerId: msg.peerId,
      elements: msg.elements,
      details: has ? details : undefined,
    };
    fan(
      remoteSceneSubs,
      msg.peerId,
      msg.elements,
      has ? details : undefined
    );
  }

  void (async () => {
    try {
      const raw = decodeBase64Url(encryptionKeyBase64Url);
      aesKey = await importAesKey(raw);
      const queued = pendingClientBroadcasts.splice(0, pendingClientBroadcasts.length);
      for (const q of queued) {
        if (disposed) return;
        if (!aesKey) break;
        try {
          const msg = await decryptMessage(aesKey, q.data, q.iv);
          handleDecryptedWireMessage(msg);
        } catch (err) {
          log.warn(
            "decrypt/parse failed (queued client-broadcast):",
            (err as Error)?.message ?? String(err)
          );
        }
      }
    } catch (err) {
      aesKeyError = (err as Error)?.message ?? String(err);
      pendingClientBroadcasts.length = 0;
      log.error(
        "AES key import failed — sync will be inert:",
        aesKeyError
      );
    }
  })();

  // ---------------------------------------------------------------
  // Socket lifecycle
  // ---------------------------------------------------------------

  const ioFactory = _ioFactory ?? io;
  socket = ioFactory(url, {
    transports: ["websocket"],
    // Auto-reconnect with exponential backoff, capped — matches
    // excalidraw-room's expectations and our reliability bar.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    timeout: 15_000,
  });

  socket.on("connect", () => {
    if (disposed) return;
    connected = true;
    log.log(`connected sid=${socket?.id ?? "?"} role=${role}`);
    socket?.emit("join-room", roomId);
    fan(connectSubs);
    // If we already have a scene to share (reconnect mid-session),
    // re-emit it so the relay propagates and any peer that stayed
    // connected picks it up immediately.
    if (lastBroadcastPayload && aesKey) {
      void encryptAndEmit(lastBroadcastPayload);
    }
  });

  socket.on("disconnect", (reason: string) => {
    if (disposed) return;
    connected = false;
    log.warn(`disconnected reason=${reason}`);
    fan(disconnectSubs);
  });

  socket.on("connect_error", (err: Error) => {
    if (disposed) return;
    log.warn(`connect_error: ${err?.message ?? String(err)}`);
  });

  socket.on("first-in-room", () => {
    if (disposed) return;
    log.log("first-in-room (waiting for peer)");
  });

  socket.on("new-user", (peerSocketId: string) => {
    if (disposed) return;
    log.log(`new-user ${peerSocketId} — re-emitting current scene`);
    // Send our current scene so the new joiner doesn't see a blank
    // canvas. Cheap; runs once per join.
    void (async () => {
      if (role === "tutor" && onNewRemotePeer) {
        try {
          await onNewRemotePeer();
        } catch (err) {
          log.warn(
            "onNewRemotePeer failed:",
            (err as Error)?.message ?? String(err)
          );
        }
      }
      if (disposed) return;
      const flushed = tryFlushPendingBroadcastNow();
      if (!flushed && lastBroadcastPayload && aesKey) {
        void encryptAndEmit(lastBroadcastPayload);
      }
    })();
  });

  socket.on("room-user-change", (members: unknown) => {
    if (disposed) return;
    // CRITICAL: the count we report MUST exclude our own socket so
    // callers can use `peerCount >= 1` to mean "another party is in
    // the room with me." Excalidraw-room sends the FULL members list
    // (including the recipient), so naively reporting members.length
    // makes the tutor's own join trip the "Student connected" UI
    // (Sarah-pilot regression, Apr 24 2026: green pill lit up at
    // t=7s of a fresh session with no student present).
    //
    // We filter by socket id where possible (most precise — handles
    // any future relay change that re-orders or deduplicates the
    // members array), and fall back to `length - 1` when the id
    // isn't known (defensive: room-user-change should always fire
    // post-connect, so socket.id should always be set, but the
    // fallback keeps us safe under any test-fake or future relay
    // tweak that fires the event mid-handshake).
    if (!Array.isArray(members)) {
      fan(peerCountSubs, 0);
      return;
    }
    const mySocketId = socket?.id;
    const others = mySocketId
      ? members.filter((m) => m !== mySocketId).length
      : Math.max(0, members.length - 1);
    fan(peerCountSubs, others);
  });

  socket.on(
    "client-broadcast",
    async (data: ArrayBuffer | Uint8Array, iv: ArrayBuffer | Uint8Array) => {
      if (disposed) return;
      if (aesKeyError) return;
      if (!aesKey) {
        if (pendingClientBroadcasts.length >= MAX_PENDING_CLIENT_BROADCASTS) {
          pendingClientBroadcasts.shift();
          log.warn(
            "pending client-broadcast queue overflow; dropped oldest frame"
          );
        }
        pendingClientBroadcasts.push({
          data: toArrayBuffer(data),
          iv: toArrayBuffer(iv),
        });
        return;
      }
      try {
        const msg = await decryptMessage(aesKey, data, iv);
        handleDecryptedWireMessage(msg);
      } catch (err) {
        log.warn(
          "decrypt/parse failed:",
          (err as Error)?.message ?? String(err)
        );
      }
    }
  );

  // ---------------------------------------------------------------
  // Outbound: throttle → encrypt → emit
  // ---------------------------------------------------------------

  /**
   * Clears the trailing-edge throttle and sends any queued `broadcastScene`
   * immediately. Returns true if a packet was (async) sent.
   */
  function tryFlushPendingBroadcastNow(): boolean {
    if (broadcastTimer !== null) {
      clearTimeout(broadcastTimer);
      broadcastTimer = null;
    }
    const payload = pendingPayload;
    pendingPayload = null;
    if (!payload || !aesKey || !socket) return false;
    void encryptAndEmit(payload);
    return true;
  }

  function flushBroadcast() {
    void tryFlushPendingBroadcastNow();
  }

  function encryptAndEmit(p: PendingPayload): Promise<void> {
    lastBroadcastPayload = p;
    const job = (async () => {
      if (!aesKey || !socket) return;
      let msg: AnyWhiteboardWireMessage;
      if (p.kind === "v3") {
        const d = p.doc;
        msg = {
          v: 3,
          peerId,
          role,
          rev: d.rev,
          pages: d.pages,
          page: d.page,
          ...(d.follow ? { follow: d.follow } : {}),
        } as WhiteboardWireMessageV3;
      } else {
        const base = {
          peerId,
          role,
          elements: p.elements,
        };
        const ext = p.extras;
        msg = ext
          ? {
              v: 2,
              ...base,
              ...(ext.follow ? { follow: ext.follow } : {}),
              ...(ext.page ? { page: ext.page } : {}),
              ...(ext.scenePageId ? { scenePageId: ext.scenePageId } : {}),
            }
          : { v: 2, ...base };
      }
      try {
        const { data, iv } = await encryptMessage(aesKey, msg);
        socket.emit("server-broadcast", roomId, data, iv);
      } catch (err) {
        log.warn(
          "encrypt/emit failed:",
          (err as Error)?.message ?? String(err)
        );
      }
    })();
    outboundChain = outboundChain.then(() => job).catch(() => undefined);
    return job;
  }

  function broadcastScene(
    elements: ReadonlyArray<ExcalidrawLikeElement>,
    extras?: WhiteboardWireBroadcastExtras
  ) {
    if (disposed) return;
    if (aesKeyError) return; // inert mode
    pendingPayload = {
      kind: "v2",
      elements: elements.slice() as ExcalidrawLikeElement[],
      extras,
    };
    if (broadcastTimer === null) {
      broadcastTimer = setTimeout(flushBroadcast, broadcastIntervalMs);
    }
  }

  function broadcastDocument(args: {
    rev: number;
    pages: Record<string, ExcalidrawLikeElement[]>;
    page: WhiteboardWirePage;
    follow?: WhiteboardWireFollow;
  }) {
    if (disposed) return;
    if (aesKeyError) return;
    const pages: Record<string, ExcalidrawLikeElement[]> = {};
    for (const [k, els] of Object.entries(args.pages)) {
      pages[k] = (els as ExcalidrawLikeElement[]).map((e) => ({ ...e }));
    }
    pendingPayload = {
      kind: "v3",
      doc: {
        rev: args.rev,
        pages,
        page: {
          activePageId: args.page.activePageId,
          pageList: args.page.pageList.map((x) => ({ ...x })),
        },
        follow: args.follow,
      },
    };
    if (broadcastTimer === null) {
      broadcastTimer = setTimeout(flushBroadcast, broadcastIntervalMs);
    }
  }

  // ---------------------------------------------------------------
  // Public surface
  // ---------------------------------------------------------------

  return {
    isConnected: () => connected,
    onRemoteScene: (cb) => {
      remoteSceneSubs.add(cb);
      const snap = lastRemoteScene;
      if (snap) {
        queueMicrotask(() => {
          if (!remoteSceneSubs.has(cb)) return;
          try {
            (cb as RemoteSceneCb)(snap.peerId, snap.elements, snap.details);
          } catch (err) {
            log.warn(
              "subscriber threw (replay):",
              (err as Error)?.message ?? String(err)
            );
          }
        });
      }
      return () => {
        remoteSceneSubs.delete(cb);
      };
    },
    onConnect: (cb) => {
      connectSubs.add(cb);
      return () => {
        connectSubs.delete(cb);
      };
    },
    onDisconnect: (cb) => {
      disconnectSubs.add(cb);
      return () => {
        disconnectSubs.delete(cb);
      };
    },
    onPeerCountChange: (cb) => {
      peerCountSubs.add(cb);
      return () => {
        peerCountSubs.delete(cb);
      };
    },
    broadcastScene,
    broadcastDocument,
    flushPendingBroadcast: tryFlushPendingBroadcastNow,
    disconnect: () => {
      if (disposed) return;
      disposed = true;
      if (broadcastTimer !== null) {
        clearTimeout(broadcastTimer);
        broadcastTimer = null;
      }
      pendingClientBroadcasts.length = 0;
      lastRemoteScene = null;
      remoteSceneSubs.clear();
      connectSubs.clear();
      disconnectSubs.clear();
      peerCountSubs.clear();
      try {
        socket?.removeAllListeners();
        socket?.disconnect();
      } catch (err) {
        log.warn("disconnect cleanup error:", (err as Error)?.message ?? String(err));
      }
      socket = null;
      connected = false;
    },
  };
}

// -----------------------------------------------------------------
// Test helpers (exported for unit tests; not part of the prod surface)
// -----------------------------------------------------------------

export const _testing = {
  decodeBase64Url,
  importAesKey,
  encryptMessage,
  decryptMessage,
};
