/**
 * IndexedDB-backed crash-recovery store for whiteboard sessions.
 *
 * Phase 1 blocker #1 (data durability on browser crash / refresh /
 * OOM): the recorder hook flushes a checkpoint of the in-progress
 * event log + audio metadata every 30 s. On reload of the workspace
 * for the same tutor + student, we surface "Resume previous session
 * (started 10:14, 24 min recorded)" instead of letting the work die
 * with the tab.
 *
 * Designed so the audio recorder + whiteboard recorder can share one
 * persistence layer (see BACKLOG.md "Reliability gaps" #1, #2). Each
 * checkpoint is keyed by `(kind, ownerKey)` so:
 *   - audio:  ownerKey = `audio:<adminUserId>:<studentId>`
 *   - whiteboard: ownerKey = `wb:<adminUserId>:<studentId>:<sessionId>`
 *
 * Quota-aware: writes catch QuotaExceededError, attempt to evict the
 * oldest checkpoint of a different session, and surface a structured
 * error rather than throwing into the recorder loop. The hook can
 * decide to keep going (audio is still in memory) or warn the tutor.
 *
 * Server-safe: all IndexedDB access is gated behind `typeof
 * indexedDB !== "undefined"` so importing this module from a server
 * action or jest's default node environment doesn't blow up.
 */

const DB_NAME = "tutoring-notes-checkpoints";
const DB_VERSION = 1;
const STORE = "checkpoints";

/**
 * One row in the checkpoints store.
 *
 * The shape is intentionally schema-version'd so we can change the
 * inner payload format without nuking the IndexedDB on a deploy.
 */
export type Checkpoint<TPayload = unknown> = {
  /** Composite primary key: `${kind}:${ownerKey}`. */
  key: string;
  kind: "whiteboard" | "audio";
  /** Stable identifier for the session being checkpointed (used by the resume UI). */
  sessionId: string;
  /** Tutor that owns this checkpoint (multi-tenant). */
  adminUserId: string;
  /** Student the session was for. */
  studentId: string;
  /** Wall-clock when the session started (ISO 8601). */
  startedAt: string;
  /** Wall-clock of the most recent flush (ISO 8601). */
  updatedAt: string;
  /** Format version of `payload` so we can migrate old rows. */
  schemaVersion: number;
  /** Free-form per-kind payload. The whiteboard kind stores the WBEventLog JSON. */
  payload: TPayload;
};

export type SaveCheckpointResult =
  | { ok: true }
  | { ok: false; reason: "quota" | "blocked" | "no-indexeddb" | "unknown"; message: string };

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * Lazy open + memoize the IndexedDB connection. The `onupgradeneeded`
 * branch creates the object store + the indexes used by `findCheckpoint`
 * and the eviction sweep.
 *
 * Memoizing the promise lets every recorder hook + replay component on
 * the same page share one connection, which is what IndexedDB wants
 * (multiple connections to the same db with different versions block
 * each other).
 */
function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDB()) {
    return Promise.reject(new Error("indexedDB-not-supported"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        // Indexes used by find + sweep paths.
        store.createIndex("by-owner", ["kind", "adminUserId", "studentId"], {
          unique: false,
        });
        store.createIndex("by-updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB-open-failed"));
    req.onblocked = () => reject(new Error("indexedDB-open-blocked"));
  });
  return dbPromise;
}

function makeKey(kind: Checkpoint["kind"], ownerKey: string): string {
  return `${kind}:${ownerKey}`;
}

/**
 * Compose the canonical owner key for a whiteboard checkpoint.
 * Centralized so the recorder hook + the resume detector use the
 * same key shape.
 */
export function whiteboardOwnerKey(
  adminUserId: string,
  studentId: string,
  sessionId: string
): string {
  return `wb:${adminUserId}:${studentId}:${sessionId}`;
}

/**
 * Compose the audio recorder's owner key. The audio recorder doesn't
 * have a stable "session id" before save, so we key on the tutor +
 * student pair plus a recorder-mount uuid stored in sessionStorage.
 * This means: refreshing the page recovers the in-progress audio for
 * the same student-page mount.
 */
export function audioOwnerKey(
  adminUserId: string,
  studentId: string,
  recorderMountId: string
): string {
  return `audio:${adminUserId}:${studentId}:${recorderMountId}`;
}

/**
 * Persist a checkpoint, replacing any existing row with the same key.
 *
 * Failure modes are returned, never thrown — the recorder hook calls
 * this from a 30 s setInterval and a throw would tear down the
 * recording. On quota error we evict the oldest checkpoint for THIS
 * tutor (never another tutor's data, even if they shared a browser)
 * and try once more.
 */
export async function saveCheckpoint<T>(
  cp: Omit<Checkpoint<T>, "key" | "updatedAt"> & { ownerKey: string }
): Promise<SaveCheckpointResult> {
  if (!hasIndexedDB()) {
    return { ok: false, reason: "no-indexeddb", message: "IndexedDB unavailable" };
  }

  const row: Checkpoint<T> = {
    key: makeKey(cp.kind, cp.ownerKey),
    kind: cp.kind,
    sessionId: cp.sessionId,
    adminUserId: cp.adminUserId,
    studentId: cp.studentId,
    startedAt: cp.startedAt,
    updatedAt: new Date().toISOString(),
    schemaVersion: cp.schemaVersion,
    payload: cp.payload,
  };

  try {
    await put(row);
    return { ok: true };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "QuotaExceededError") {
      // Try one eviction-then-retry pass scoped to this tutor only.
      try {
        const evicted = await evictOldestForOwner(cp.kind, cp.adminUserId, row.key);
        if (evicted) {
          await put(row);
          return { ok: true };
        }
      } catch {
        // fallthrough to quota error
      }
      return {
        ok: false,
        reason: "quota",
        message: "Browser storage is full. The recording is still in memory; finish the session and Stop to upload.",
      };
    }
    return {
      ok: false,
      reason: "unknown",
      message: (err as Error)?.message ?? String(err),
    };
  }
}

async function put(row: Checkpoint): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.put(row);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("put-failed"));
    tx.onerror = () => reject(tx.error ?? new Error("tx-failed"));
  });
}

/**
 * Look up an in-progress checkpoint for a given owner key. Returns
 * null if none exists or IndexedDB is unavailable.
 */
export async function findCheckpoint<T>(
  kind: Checkpoint["kind"],
  ownerKey: string
): Promise<Checkpoint<T> | null> {
  if (!hasIndexedDB()) return null;
  try {
    const db = await openDb();
    return await new Promise<Checkpoint<T> | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(makeKey(kind, ownerKey));
      req.onsuccess = () => resolve((req.result as Checkpoint<T> | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("get-failed"));
    });
  } catch {
    return null;
  }
}

/**
 * Find the most recent checkpoint of a given kind for a tutor +
 * student. Used by the workspace page on cold mount to detect "you
 * had a session in progress; resume?".
 */
export async function findLatestCheckpointForOwner<T>(
  kind: Checkpoint["kind"],
  adminUserId: string,
  studentId: string
): Promise<Checkpoint<T> | null> {
  if (!hasIndexedDB()) return null;
  try {
    const db = await openDb();
    return await new Promise<Checkpoint<T> | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const idx = store.index("by-owner");
      const req = idx.openCursor(IDBKeyRange.only([kind, adminUserId, studentId]), "prev");
      let best: Checkpoint<T> | null = null;
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(best);
        const row = cursor.value as Checkpoint<T>;
        if (!best || row.updatedAt > best.updatedAt) best = row;
        cursor.continue();
      };
      req.onerror = () => reject(req.error ?? new Error("cursor-failed"));
    });
  } catch {
    return null;
  }
}

/**
 * Delete a checkpoint after the session has been successfully
 * uploaded. The recorder hook calls this on Stop -> upload-confirmed.
 */
export async function clearCheckpoint(
  kind: Checkpoint["kind"],
  ownerKey: string
): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.delete(makeKey(kind, ownerKey));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("delete-failed"));
    });
  } catch {
    // Eviction failures are not fatal — the row will get rewritten on
    // the next save or aged out by browser GC. We deliberately swallow.
  }
}

/**
 * Sweep eviction: drop the oldest checkpoint owned by this tutor for
 * the given kind, never touching other tutors' data. Returns true if
 * something was evicted, false if the store was empty / scoped to
 * this owner only had the live row.
 */
async function evictOldestForOwner(
  kind: Checkpoint["kind"],
  adminUserId: string,
  excludeKey: string
): Promise<boolean> {
  const db = await openDb();
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const idx = store.index("by-owner");
    const range = IDBKeyRange.bound([kind, adminUserId, ""], [kind, adminUserId, "\uffff"]);
    const req = idx.openCursor(range);
    let oldest: { key: string; updatedAt: string } | null = null;
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        if (!oldest) return resolve(false);
        const del = store.delete(oldest.key);
        del.onsuccess = () => resolve(true);
        del.onerror = () => reject(del.error ?? new Error("evict-failed"));
        return;
      }
      const row = cursor.value as Checkpoint;
      if (row.key !== excludeKey) {
        if (!oldest || row.updatedAt < oldest.updatedAt) {
          oldest = { key: row.key, updatedAt: row.updatedAt };
        }
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("cursor-failed"));
  });
}

/**
 * Test-only escape hatch: drop the cached connection so a test that
 * mucks with `indexedDB` mocks gets a fresh open. NOT for production
 * code paths.
 */
export function _resetCheckpointStoreForTests(): void {
  dbPromise = null;
}
