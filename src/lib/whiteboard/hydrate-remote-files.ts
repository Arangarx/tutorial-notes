/**
 * Fetches tutor-uploaded whiteboard image binaries by `customData.assetUrl`
 * and registers them in Excalidraw's in-memory `BinaryFiles` table so
 * `updateScene` image elements (which only carry a `fileId` pointer)
 * render on peer clients.
 *
 * Used by the student join page and the tutor workspace when applying a
 * remote scene that references images inserted via `insert-asset.ts`.
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

/**
 * For each `image` element with `fileId` + `customData.assetUrl` whose
 * `fileId` is not yet in `loadedFileIds`, fetch the bytes and call
 * `excalidrawAPI.addFiles`. Idempotent per `fileId` for a session.
 */
export async function hydrateRemoteImageFilesForScene(
  excalidrawAPI: ExcalidrawApiLike,
  elements: ReadonlyArray<ExcalidrawLikeElement | unknown>,
  loadedFileIds: Set<string>
): Promise<void> {
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
    const url = el.customData?.assetUrl;
    if (typeof url !== "string" || url.length < 8) continue;

    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!res.ok) continue;
      const blob = await res.blob();
      const mime =
        normalizeImageMime(blob.type || res.headers.get("content-type") || "") ??
        "image/png";
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
    } catch {
      // Best-effort: leave placeholder; a later frame may retry if URL appears.
    }
  }

  if (files.length > 0) {
    excalidrawAPI.addFiles(files);
  }
}
