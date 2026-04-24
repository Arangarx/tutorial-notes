/**
 * Unit tests for `src/lib/whiteboard/sync-client.ts`.
 *
 * Runs under the default Node test environment — Node 20's WebCrypto
 * implementation is fully spec-compliant for AES-GCM, so the
 * encrypt/decrypt round-trip is exercised against the real subtle
 * crypto. The socket.io transport is faked via the `_ioFactory` hook
 * so we can test wire-protocol behaviour without a relay.
 *
 * Coverage targets (mirrors plan reliability axes):
 *   - AES-GCM round-trip + tamper detection
 *   - join-room emission on connect
 *   - new-user triggers re-broadcast of cached scene (no blank canvas)
 *   - broadcastScene is throttled (single emit per interval)
 *   - reconnect re-emits the last scene + fires onConnect again
 *   - decrypt failure is swallowed (no listener throws)
 *   - peerId echo suppression (relay echo doesn't loop into ingestRemote)
 *   - disconnect tears down listeners + is idempotent
 */

import { EventEmitter } from "node:events";
import {
  createWhiteboardSyncClient,
  generateEncryptionKeyBase64Url,
  _testing,
  type WhiteboardWireMessage,
} from "@/lib/whiteboard/sync-client";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

// Minimal fake socket.io Socket — surface only what sync-client touches.
class FakeSocket extends EventEmitter {
  id = `sock_${Math.random().toString(36).slice(2)}`;
  emitted: Array<{ event: string; args: unknown[] }> = [];
  removedAll = false;
  disconnected = false;

  emit(event: string | symbol, ...args: unknown[]): boolean {
    if (typeof event === "string") {
      this.emitted.push({ event, args });
    }
    // Don't actually broadcast — tests trigger inbound events manually.
    return true;
  }

  // socket.io's API: `removeAllListeners()` returns the socket;
  // EventEmitter inherits it but we want to track that it was called.
  removeAllListeners(event?: string | symbol): this {
    this.removedAll = true;
    return super.removeAllListeners(event) as this;
  }

  disconnect(): this {
    this.disconnected = true;
    return this;
  }

  /** Test helper — simulate the relay delivering an event to us. */
  inject(event: string, ...args: unknown[]): void {
    super.emit(event, ...args);
  }

  /**
   * Fake the connect handshake. Real socket.io fires `connect`
   * asynchronously; we mimic that with queueMicrotask so listeners
   * registered immediately after `io()` are in place.
   */
  fakeConnect(): void {
    queueMicrotask(() => this.inject("connect"));
  }
}

function fakeIoFactory(): { factory: typeof import("socket.io-client").io; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = [];
  const factory = ((..._args: unknown[]) => {
    const s = new FakeSocket();
    sockets.push(s);
    s.fakeConnect();
    return s;
  }) as unknown as typeof import("socket.io-client").io;
  return { factory, sockets };
}

const sampleScene = (id: string): ExcalidrawLikeElement[] => [
  {
    id,
    type: "rectangle",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    strokeColor: "#000",
  },
];

async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

/**
 * Settle real I/O — used by tests that exercise `crypto.subtle.*` and
 * therefore depend on libuv ticks the fake-timer clock can't simulate.
 */
function realTick(ms = 5): Promise<void> {
  return new Promise((resolve) => {
    // Use the underlying real setTimeout so we don't get caught by
    // jest.useFakeTimers in adjacent describe blocks.
    const realSetTimeout: typeof setTimeout =
      // jest.requireActual gives us the unfaked timer
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (jest.requireActual("timers") as typeof import("timers")).setTimeout;
    realSetTimeout(resolve, ms);
  });
}

describe("sync-client AES-GCM crypto", () => {
  test("generateEncryptionKeyBase64Url produces a 32-byte key", () => {
    const k = generateEncryptionKeyBase64Url();
    const raw = _testing.decodeBase64Url(k);
    expect(raw.length).toBe(32);
  });

  test("encrypt → decrypt round-trips the message", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWireMessage = {
      v: 1,
      peerId: "peer-a",
      role: "tutor",
      elements: sampleScene("e1"),
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    const out = await _testing.decryptMessage(aes, data, iv);
    expect(out).toEqual(msg);
  });

  test("decrypt fails when the ciphertext is tampered (GCM auth tag)", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWireMessage = {
      v: 1,
      peerId: "peer-a",
      role: "tutor",
      elements: [],
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    const tampered = new Uint8Array(data.byteLength);
    tampered.set(new Uint8Array(data));
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    await expect(_testing.decryptMessage(aes, tampered, iv)).rejects.toBeDefined();
  });

  test("decrypt fails with the wrong key", async () => {
    const aesA = await _testing.importAesKey(
      _testing.decodeBase64Url(generateEncryptionKeyBase64Url())
    );
    const aesB = await _testing.importAesKey(
      _testing.decodeBase64Url(generateEncryptionKeyBase64Url())
    );
    const msg: WhiteboardWireMessage = {
      v: 1,
      peerId: "peer-a",
      role: "tutor",
      elements: [],
    };
    const { data, iv } = await _testing.encryptMessage(aesA, msg);
    await expect(_testing.decryptMessage(aesB, data, iv)).rejects.toBeDefined();
  });
});

describe("sync-client lifecycle", () => {
  // NOTE: real timers throughout — these tests exercise `crypto.subtle`
  // which is libuv-backed and cannot be advanced by jest.advanceTimersByTime.
  // `broadcastIntervalMs` is set very small (5 ms) so tests stay fast
  // without resorting to a fake clock.

  test("emits join-room with the configured roomId on connect", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const onConnectSpy = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });
    client.onConnect(onConnectSpy);

    await realTick();
    await flushMicrotasks();

    const sock = sockets[0]!;
    const joinEmit = sock.emitted.find((e) => e.event === "join-room");
    expect(joinEmit).toBeDefined();
    expect(joinEmit?.args).toEqual(["room-xyz"]);
    expect(client.isConnected()).toBe(true);
    expect(onConnectSpy).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  test("broadcastScene is throttled and emits server-broadcast", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      broadcastIntervalMs: 5,
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;
    const beforeCount = sock.emitted.filter((e) => e.event === "server-broadcast").length;

    client.broadcastScene(sampleScene("a"));
    client.broadcastScene(sampleScene("b"));
    client.broadcastScene(sampleScene("c"));

    await realTick(20);
    await flushMicrotasks(10);

    const afterCount = sock.emitted.filter((e) => e.event === "server-broadcast").length;
    expect(afterCount - beforeCount).toBe(1);

    const last = sock.emitted.filter((e) => e.event === "server-broadcast").at(-1)!;
    expect(last.args[0]).toBe("room-xyz");
    expect(last.args[1]).toBeInstanceOf(ArrayBuffer);

    client.disconnect();
  });

  test("new-user triggers re-emit of last scene (no blank canvas for late joiner)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      broadcastIntervalMs: 5,
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;
    client.broadcastScene(sampleScene("a"));
    await realTick(20);
    await flushMicrotasks(10);

    const before = sock.emitted.filter((e) => e.event === "server-broadcast").length;
    expect(before).toBe(1);

    sock.inject("new-user", "fake-peer-sid");
    await realTick(10);
    await flushMicrotasks(10);

    const after = sock.emitted.filter((e) => e.event === "server-broadcast").length;
    expect(after).toBe(2);

    client.disconnect();
  });

  test("client-broadcast inbound delivers decrypted scene to onRemoteScene", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const remoteCb = jest.fn();
    client.onRemoteScene(remoteCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWireMessage = {
      v: 1,
      peerId: "student-1",
      role: "student",
      elements: sampleScene("remote-1"),
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);

    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(10);
    await flushMicrotasks(15);

    expect(remoteCb).toHaveBeenCalledTimes(1);
    expect(remoteCb).toHaveBeenCalledWith("student-1", msg.elements);

    client.disconnect();
  });

  test("relay echo of own peerId is suppressed", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "my-fixed-peer",
      _ioFactory: factory,
    });

    const remoteCb = jest.fn();
    client.onRemoteScene(remoteCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const ownEcho: WhiteboardWireMessage = {
      v: 1,
      peerId: "my-fixed-peer",
      role: "tutor",
      elements: sampleScene("e"),
    };
    const { data, iv } = await _testing.encryptMessage(aes, ownEcho);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(10);
    await flushMicrotasks(15);

    expect(remoteCb).not.toHaveBeenCalled();
    client.disconnect();
  });

  test("garbage client-broadcast does not throw to listeners", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const remoteCb = jest.fn();
    client.onRemoteScene(remoteCb);

    await realTick();
    await flushMicrotasks(10);

    const garbageData = new ArrayBuffer(64);
    new Uint8Array(garbageData).fill(0xab);
    const garbageIv = new ArrayBuffer(12);
    new Uint8Array(garbageIv).fill(0xcd);

    expect(() => {
      sockets[0]!.inject("client-broadcast", garbageData, garbageIv);
    }).not.toThrow();
    await realTick(10);
    await flushMicrotasks(15);

    expect(remoteCb).not.toHaveBeenCalled();
    client.disconnect();
  });

  test("disconnect → reconnect fires onConnect twice and re-emits last scene", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      broadcastIntervalMs: 5,
      _ioFactory: factory,
    });

    const onConnectSpy = jest.fn();
    const onDisconnectSpy = jest.fn();
    client.onConnect(onConnectSpy);
    client.onDisconnect(onDisconnectSpy);

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;

    client.broadcastScene(sampleScene("a"));
    await realTick(20);
    await flushMicrotasks(10);

    const broadcastsAfterFirst = sock.emitted.filter(
      (e) => e.event === "server-broadcast"
    ).length;
    expect(broadcastsAfterFirst).toBe(1);

    // socket.io-client keeps the same Socket instance across reconnects
    // and re-fires `connect`. Mirror that here.
    sock.inject("disconnect", "transport close");
    await flushMicrotasks(10);
    expect(onDisconnectSpy).toHaveBeenCalledTimes(1);
    expect(client.isConnected()).toBe(false);

    sock.inject("connect");
    await realTick(20);
    await flushMicrotasks(15);
    expect(onConnectSpy).toHaveBeenCalledTimes(2);
    expect(client.isConnected()).toBe(true);

    const broadcastsAfterReconnect = sock.emitted.filter(
      (e) => e.event === "server-broadcast"
    ).length;
    expect(broadcastsAfterReconnect).toBe(2);

    client.disconnect();
  });

  test("disconnect() is idempotent and tears down listeners", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });
    await realTick();
    await flushMicrotasks(10);

    client.disconnect();
    expect(sockets[0]!.removedAll).toBe(true);
    expect(sockets[0]!.disconnected).toBe(true);

    expect(() => client.disconnect()).not.toThrow();
  });

  test("invalid encryption key → inert mode (no broadcasts emitted)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const errLog = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: "too-short",
      role: "tutor",
      broadcastIntervalMs: 5,
      _ioFactory: factory,
      _logger: { log: jest.fn(), warn: jest.fn(), error: errLog },
    });

    await realTick();
    await flushMicrotasks(10);

    const beforeCount = sockets[0]!.emitted.filter(
      (e) => e.event === "server-broadcast"
    ).length;

    client.broadcastScene(sampleScene("a"));
    await realTick(30);
    await flushMicrotasks(10);

    const afterCount = sockets[0]!.emitted.filter(
      (e) => e.event === "server-broadcast"
    ).length;
    expect(afterCount).toBe(beforeCount);
    expect(errLog).toHaveBeenCalled();

    client.disconnect();
  });
});
