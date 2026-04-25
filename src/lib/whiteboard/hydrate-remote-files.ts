/**
 * Fetches tutor-uploaded whiteboard image binaries by `customData.assetUrl`
 * and registers them in Excalidraw's in-memory `BinaryFiles` table so
 * `updateScene` image elements (which only carry a `fileId` pointer)
 * render on peer clients.
 *
 * Safeguards: one automatic retry (network/5xx), session-scoped give-up
 * for persistent failures, and structured result + `console.warn` for
 * pilot debugging.
 */

import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

function normalizeImageMime(
  raw: string
):
  | "image/png"
  | "image/jpeg"
  | "image/svg+xml"
  | "image/webp"
  | "image/gif"
  | null {
  const mime = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (mime) {
    case "image/png":
      return "image/png";
    case "image/jpeg":
    case "image/jpg":
      return "image/jpeg";
    case "image/gif":
      return "image/gif";
    case "image/webp":
      return "image/webp";
    case "image/svg+xml":
      return "image/svg+xml";
    default:
      return null;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

const RETRY_DELAY_MS = 400;

type FetchImageOk = { ok: true; blob: Blob; contentType: string | null };
type FetchImageFail = { ok: false; detail: string };

/**
 * Fetches a URL with one retry: useful for cold CDN / transient 5xx / flaky Wi‑Fi.
 * Does not retry HTTP 404 (permanent) or 4xx other than 429 (optional: we retry 5xx only).
 */
async function fetchImageBytes(
  url: string,
  sameOrigin: boolean
): Promise<FetchImageOk | FetchImageFail> {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  let lastDetail = "Unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        mode: "cors",
        credentials: sameOrigin ? "same-origin" : "omit",
      });
      if (res.ok) {
        const blob = await res.blob();
        return {
          ok: true,
          blob,
          contentType: res.headers.get("content-type"),
        };
      }
      lastDetail = `HTTP ${res.status}`;
      // No point retrying not-found.
      if (res.status === 404) {
        return { ok: false, detail: lastDetail };
      }
      if (res.status < 500 && attempt === 0) {
        return { ok: false, detail: lastDetail };
      }
      if (attempt === 0) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return { ok: false, detail: lastDetail };
    } catch (err) {
      lastDetail = (err as Error)?.message ?? String(err);
      if (attempt === 0) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return { ok: false, detail: lastDetail };
    }
  }
  return { ok: false, detail: lastDetail };
}

export type HydrateRemoteImageFilesResult = {
  addedFileCount: number;
  /** Image elements in the scene with no `customData.assetUrl` (e.g. local paste not uploaded). */
  missingAssetUrlFileIds: string[];
  /** Fetches that failed after retry; caller may add these to `giveUpFileIds`. */
  fetchFailed: Array<{ fileId: string; detail: string }>;
};

export type HydrateRemoteImageFilesOptions = {
  /** "student" | "tutor" — prefixes `console.warn` for support. */
  logContext?: "student" | "tutor";
  /**
   * Rewrite `customData.assetUrl` before `fetch` (e.g. private Vercel Blob
   * → same-origin proxy). Defaults to pass-through.
   */
  resolveReadUrl?: (url: string) => string;
  /**
   * When a fetch definitively failed, add the `fileId` here to avoid
   * hammering the same URL for the rest of the session.
   */
  giveUpFileIds?: Set<string>;
  /**
   * Keys like `missing:<fileId>` or `fetch:<fileId>` — skip duplicate
   * `console.warn` when the same scene is re-broadcasted often.
   */
  warnDedupe?: Set<string>;
};

/**
 * For each `image` element with `fileId` + `customData.assetUrl` whose
 * `fileId` is not yet in `loadedFileIds`, fetch the bytes and call
 * `excalidrawAPI.addFiles`. Idempotent per `fileId` for a session.
 */
export async function hydrateRemoteImageFilesForScene(
  excalidrawAPI: ExcalidrawApiLike,
  elements: ReadonlyArray<ExcalidrawLikeElement | unknown>,
  loadedFileIds: Set<string>,
  options?: HydrateRemoteImageFilesOptions
): Promise<HydrateRemoteImageFilesResult> {
  const logPrefix = options?.logContext
    ? `[hydrate-remote-files; ${options.logContext}]`
    : "[hydrate-remote-files]";
  const resolveRead = options?.resolveReadUrl ?? ((u: string) => u);
  const giveUp = options?.giveUpFileIds;
  const warnDedupe = options?.warnDedupe;
  const missingSet = new Set<string>();
  const fetchFailed: Array<{ fileId: string; detail: string }> = [];
  const files: Array<{
    id: string;
    mimeType:
      | "image/png"
      | "image/jpeg"
      | "image/svg+xml"
      | "image/webp"
      | "image/gif";
    dataURL: string;
    created: number;
  }> = [];

  for (const raw of elements) {
    if (!raw || typeof raw !== "object") continue;
    const el = raw as ExcalidrawLikeElement;
    if (el.type !== "image" || !el.fileId) continue;
    if (typeof el.fileId !== "string") continue;
    if (loadedFileIds.has(el.fileId)) continue;
    if (giveUp?.has(el.fileId)) continue;

    const rawUrl = el.customData?.assetUrl;
    if (typeof rawUrl !== "string" || rawUrl.length < 8) {
      missingSet.add(el.fileId);
      const dedupeKey = `missing:${el.fileId}`;
      if (!warnDedupe || !warnDedupe.has(dedupeKey)) {
        if (warnDedupe) warnDedupe.add(dedupeKey);
        console.warn(
          logPrefix,
          "image element has no customData.assetUrl; peer may not show this bitmap without a re-insert",
          { fileId: el.fileId, elementId: el.id }
        );
      }
      continue;
    }

    const url = resolveRead(rawUrl);
    const sameOrigin =
      typeof window !== "undefined" && url.startsWith(window.location.origin);
    const fetchResult = await fetchImageBytes(url, sameOrigin);
    if (!fetchResult.ok) {
      fetchFailed.push({ fileId: el.fileId, detail: fetchResult.detail });
      giveUp?.add(el.fileId);
      const dedupeKey = `fetch:${el.fileId}:${fetchResult.detail}`;
      if (!warnDedupe || !warnDedupe.has(dedupeKey)) {
        if (warnDedupe) warnDedupe.add(dedupeKey);
        console.warn(logPrefix, "failed to fetch image asset after retry", {
          fileId: el.fileId,
          detail: fetchResult.detail,
        });
      }
      continue;
    }
    const { blob, contentType } = fetchResult;
    const mime =
      normalizeImageMime(
        blob.type || contentType || ""
      ) ?? "image/png";
    const dataURL = await blobToDataUrl(
      new Blob([blob], { type: mime })
    );
    files.push({
      id: el.fileId,
      mimeType: mime,
      dataURL,
      created: Date.now(),
    });
    loadedFileIds.add(el.fileId);
  }

  if (files.length > 0) {
    excalidrawAPI.addFiles(files);
  }

  return {
    addedFileCount: files.length,
    missingAssetUrlFileIds: Array.from(missingSet),
    fetchFailed,
  };
}
