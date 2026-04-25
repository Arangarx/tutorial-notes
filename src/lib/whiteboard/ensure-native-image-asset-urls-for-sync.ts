"use client";

/**
 * Excalidraw's built-in image tool, library, drag/drop, and paste all store
 * pixels in the local `BinaryFiles` map only. Live sync JSON carries
 * `image` elements with `fileId` but peers need `customData.assetUrl` to
 * fetch bytes (see `hydrate-remote-files.ts`). Our PDF/image toolbar path
 * sets `assetUrl` at insert; this module back-fills it for native paths.
 */

import { uploadWhiteboardAsset } from "@/lib/whiteboard/upload";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

export type BinaryFileFromExcalidraw = {
  id?: string;
  dataURL?: string;
  mimeType?: string;
};

function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const m = /data:([^;]+)/.exec(head);
  const mime = (m?.[1] ?? "application/octet-stream").trim();
  if (head.includes(";base64")) {
    try {
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { blob: new Blob([bytes], { type: mime }), mime };
    } catch {
      return null;
    }
  }
  try {
    const text = decodeURIComponent(body);
    return { blob: new Blob([text], { type: mime }), mime };
  } catch {
    return null;
  }
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("svg")) return "svg";
  return "bin";
}

function needsAssetUrl(el: ExcalidrawLikeElement): boolean {
  if (el.type !== "image" || !el.fileId) return false;
  const u = el.customData?.assetUrl;
  return typeof u !== "string" || u.length < 8;
}

function patchElementsWithFileUrl(
  elements: ReadonlyArray<unknown>,
  fileId: string,
  assetUrl: string
): ExcalidrawLikeElement[] {
  return elements.map((raw) => {
    const el = raw as ExcalidrawLikeElement;
    if (el.type !== "image" || el.fileId !== fileId) return el as ExcalidrawLikeElement;
    return {
      ...el,
      customData: {
        ...(el.customData ?? {}),
        assetUrl,
      },
    };
  });
}

function mergeFileSources(
  filesFromEvent: Record<string, BinaryFileFromExcalidraw> | null | undefined,
  getFiles: () => Record<string, BinaryFileFromExcalidraw>
): Record<string, BinaryFileFromExcalidraw> {
  return { ...getFiles(), ...(filesFromEvent ?? {}) };
}

export type EnsureNativeImageAssetUrlsArgs = {
  elements: ReadonlyArray<unknown>;
  files: Record<string, BinaryFileFromExcalidraw> | null | undefined;
  getFiles: () => Record<string, BinaryFileFromExcalidraw>;
  whiteboardSessionId: string;
  studentId: string;
  /** Student `/w/[token]` page: pass the path token so Blob upload can authorize without a tutor session. */
  joinToken?: string;
  /** Completed uploads: fileId → public asset URL (mutated by this module). */
  fileIdToAssetUrl: Map<string, string>;
  /** Uploads in flight (mutated). */
  inFlight: Set<string>;
};

/**
 * Uploads local image binaries for any `image` element missing
 * `customData.assetUrl`, then returns a new element list with URLs set.
 * Returns `null` if there is nothing to do or work is only in-flight.
 */
export async function ensureNativeImageAssetUrlsForSync(
  args: EnsureNativeImageAssetUrlsArgs
): Promise<ExcalidrawLikeElement[] | null> {
  const {
    elements,
    files: filesFromEvent,
    getFiles,
    whiteboardSessionId,
    studentId,
    joinToken,
    fileIdToAssetUrl,
    inFlight,
  } = args;

  const merged = mergeFileSources(filesFromEvent, getFiles);
  let working = elements as ReadonlyArray<ExcalidrawLikeElement>;
  let changed = false;

  // Apply any URLs we already know (e.g. finished upload not yet in scene).
  for (const el of working) {
    if (!needsAssetUrl(el) || !el.fileId) continue;
    const known = fileIdToAssetUrl.get(el.fileId);
    if (known) {
      working = patchElementsWithFileUrl(working, el.fileId, known);
      changed = true;
    }
  }

  const toUpload = new Map<
    string,
    { dataURL: string; mime: string }
  >();

  for (const el of working) {
    if (!needsAssetUrl(el) || !el.fileId) continue;
    if (fileIdToAssetUrl.has(el.fileId)) continue;
    if (inFlight.has(el.fileId)) continue;

    const bin = merged[el.fileId];
    const dataURL =
      bin && typeof bin.dataURL === "string" ? bin.dataURL : "";
    if (!dataURL || dataURL.length < 16) continue;

    const parsed = dataUrlToBlob(dataURL);
    if (!parsed) continue;
    toUpload.set(el.fileId, { dataURL, mime: parsed.mime });
  }

  if (toUpload.size === 0) {
    return changed ? [...(working as ExcalidrawLikeElement[])] : null;
  }

  for (const fileId of toUpload.keys()) {
    inFlight.add(fileId);
  }

  try {
    for (const [fileId, { dataURL, mime }] of toUpload) {
      const parsed = dataUrlToBlob(dataURL);
      if (!parsed) continue;
      const ext = extForMime(mime || parsed.mime);
      const upload = await uploadWhiteboardAsset({
        whiteboardSessionId,
        studentId,
        blob: parsed.blob,
        filename: `excalidraw-image-${fileId.slice(0, 10)}.${ext}`,
        contentType: mime || parsed.mime || "image/png",
        assetTag: "native-image",
        ...(joinToken ? { joinToken } : {}),
      });
      if (!upload.ok) {
        console.warn(
          "[ensure-native-image-asset-urls-for-sync] upload failed",
          fileId,
          upload.error
        );
        continue;
      }
      fileIdToAssetUrl.set(fileId, upload.blobUrl);
      working = patchElementsWithFileUrl(working, fileId, upload.blobUrl);
      changed = true;
    }
  } finally {
    for (const fileId of toUpload.keys()) {
      inFlight.delete(fileId);
    }
  }

  return changed && working
    ? [...(working as ExcalidrawLikeElement[])]
    : null;
}
