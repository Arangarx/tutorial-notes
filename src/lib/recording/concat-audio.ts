import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { put } from "@vercel/blob";
import ffmpegStatic from "ffmpeg-static";
import { fetchPrivateBlobBytes } from "@/lib/blob";
import {
  harnessServerPut,
  isBlobHarnessActive,
} from "@/lib/blob-harness";
import { BLOB_MAX_BYTES } from "@/lib/audio-constants";
import { probeAudioBufferDurationSeconds } from "@/lib/transcribe-ffmpeg";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";

const execFileAsync = promisify(execFile);

/** FOR-ANDREW-G-C: above this cap, skip concat and keep multi-segment replay. */
export const CONCAT_MAX_SEGMENT_COUNT = 400;

/** Need at least two mixdown segments to benefit from concat. */
export const CONCAT_MIN_SEGMENT_COUNT = 2;

export type MixdownSegmentInput = {
  blobUrl: string;
  mimeType: string;
  streamId: string;
  orderIndex: number;
};

export type ConcatAudioResult =
  | {
      ok: true;
      blobUrl: string;
      mimeType: string;
      sizeBytes: number;
      durationSeconds: number;
      segmentCount: number;
    }
  | {
      ok: false;
      reason:
        | "ffmpeg_unavailable"
        | "too_few_segments"
        | "too_many_segments"
        | "no_mixdown_segments"
        | "download_failed"
        | "encode_failed"
        | "upload_failed"
        | "probe_failed";
      segmentCount?: number;
    };

function getFfmpegPath(): string | null {
  const fromEnv = process.env.FFMPEG_BIN?.trim();
  if (fromEnv) return fromEnv;
  return ffmpegStatic ?? null;
}

/**
 * Replay-mix invariant: concat input is mixdown-only (`tutor:mic`).
 * Per-speaker `student:peer-*` lanes must never enter the concat set.
 */
export function selectMixdownSegmentsForConcat(
  segments: readonly MixdownSegmentInput[]
): MixdownSegmentInput[] {
  return segments
    .filter((s) => s.streamId === TUTOR_MIC_STREAM_ID)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

export function shouldSkipConcat(segmentCount: number): boolean {
  if (segmentCount < CONCAT_MIN_SEGMENT_COUNT) return true;
  if (segmentCount > CONCAT_MAX_SEGMENT_COUNT) return true;
  return false;
}

function escapeConcatListPath(filePath: string): string {
  return filePath.replace(/'/g, "'\\''");
}

async function concatBuffersToWebm(
  ffmpegPath: string,
  inputPaths: string[],
  outputPath: string
): Promise<void> {
  const listPath = path.join(path.dirname(outputPath), "concat-list.txt");
  const listBody = inputPaths
    .map((p) => `file '${escapeConcatListPath(p)}'`)
    .join("\n");
  await fs.writeFile(listPath, listBody, "utf8");

  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-vn",
      "-map",
      "0:a:0",
      "-c:a",
      "libopus",
      "-b:a",
      "48k",
      outputPath,
    ],
    { maxBuffer: BLOB_MAX_BYTES }
  );
}

/**
 * WS-G — download mixdown segment blobs, re-encode concat to libopus WebM,
 * upload to private Vercel Blob. Best-effort; callers must fall back to
 * multi-segment replay on any failure.
 */
export async function concatMixdownSegmentsToBlob(args: {
  adminUserId: string;
  studentId: string;
  whiteboardSessionId: string;
  segments: readonly MixdownSegmentInput[];
}): Promise<ConcatAudioResult> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    return { ok: false, reason: "ffmpeg_unavailable" };
  }

  const mixdown = selectMixdownSegmentsForConcat(args.segments);
  if (mixdown.length === 0) {
    return { ok: false, reason: "no_mixdown_segments", segmentCount: 0 };
  }
  if (shouldSkipConcat(mixdown.length)) {
    return {
      ok: false,
      reason:
        mixdown.length > CONCAT_MAX_SEGMENT_COUNT
          ? "too_many_segments"
          : "too_few_segments",
      segmentCount: mixdown.length,
    };
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tn-wsg-concat-"));
  try {
    const localPaths: string[] = [];
    for (let i = 0; i < mixdown.length; i++) {
      const seg = mixdown[i];
      try {
        const { buffer } = await fetchPrivateBlobBytes(seg.blobUrl);
        const localPath = path.join(tmpRoot, `seg-${i}.webm`);
        await fs.writeFile(localPath, buffer);
        localPaths.push(localPath);
      } catch {
        return {
          ok: false,
          reason: "download_failed",
          segmentCount: mixdown.length,
        };
      }
    }

    const outputPath = path.join(tmpRoot, "concat-out.webm");
    try {
      await concatBuffersToWebm(ffmpegPath, localPaths, outputPath);
    } catch {
      return {
        ok: false,
        reason: "encode_failed",
        segmentCount: mixdown.length,
      };
    }

    const outputBuffer = await fs.readFile(outputPath);
    const durationSeconds = await probeAudioBufferDurationSeconds(
      outputBuffer,
      "concat.webm",
      "audio/webm"
    );
    if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return {
        ok: false,
        reason: "probe_failed",
        segmentCount: mixdown.length,
      };
    }

    const blobPath = `whiteboard-sessions/${args.adminUserId}/${args.studentId}/${args.whiteboardSessionId}-concat.webm`;
    const mimeType = "audio/webm";
    try {
      const putResult = isBlobHarnessActive()
        ? await harnessServerPut(
            blobPath,
            outputBuffer,
            { contentType: mimeType, addRandomSuffix: true },
            "http://localhost"
          )
        : await put(blobPath, outputBuffer, {
            access: "private",
            contentType: mimeType,
            addRandomSuffix: true,
          });

      return {
        ok: true,
        blobUrl: putResult.url,
        mimeType,
        sizeBytes: outputBuffer.byteLength,
        durationSeconds: Math.round(durationSeconds),
        segmentCount: mixdown.length,
      };
    } catch {
      return {
        ok: false,
        reason: "upload_failed",
        segmentCount: mixdown.length,
      };
    }
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
