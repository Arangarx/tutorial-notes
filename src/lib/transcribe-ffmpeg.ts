import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { WHISPER_MAX_BYTES } from "@/lib/transcribe-constants";

const execFileAsync = promisify(execFile);

/** Target max bytes per chunk before Whisper (~22 MB leaves margin under 25 MB). */
const CHUNK_TARGET_BYTES = 22 * 1024 * 1024;

export type WhisperAudioPart = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

function getFfmpegPath(): string | null {
  const fromEnv = process.env.FFMPEG_BIN?.trim();
  if (fromEnv) return fromEnv;
  return ffmpegStatic ?? null;
}

function baseMime(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

function extFromMimeOrFilename(mimeType: string, filename: string): string {
  const base = baseMime(mimeType);
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/webm;codecs=opus": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
  };
  if (map[base]) return map[base];
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "webm";
}

/**
 * Parse Duration: HH:MM:SS.xx from ffmpeg -i stderr.
 */
async function probeDurationSeconds(ffmpegPath: string, inputPath: string): Promise<number> {
  try {
    await execFileAsync(ffmpegPath, ["-hide_banner", "-i", inputPath], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err: unknown) {
    const stderr =
      typeof err === "object" && err !== null && "stderr" in err
        ? String((err as { stderr?: string }).stderr)
        : "";
    const stdout =
      typeof err === "object" && err !== null && "stdout" in err
        ? String((err as { stdout?: string }).stdout)
        : "";
    const combined = stderr + stdout;
    const match = combined.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseInt(match[3], 10);
      const cs = parseInt(match[4], 10);
      return h * 3600 + m * 60 + s + cs / 100;
    }
  }
  throw new Error("Could not read audio duration (ffmpeg probe failed).");
}

/**
 * Extract [startSec, startSec+durationSec) into a new file. Returns the path
 * to the produced file (may be `.webm` if stream-copy failed and we re-encoded).
 */
async function extractSegment(
  ffmpegPath: string,
  inputPath: string,
  startSec: number,
  durationSec: number,
  outputPath: string
): Promise<string> {
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(startSec),
    "-i",
    inputPath,
    "-t",
    String(durationSec),
    "-c",
    "copy",
    outputPath,
  ];
  try {
    await execFileAsync(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024 });
    return outputPath;
  } catch {
    const webmOut = outputPath.replace(/\.[^.]+$/, "") + "-enc.webm";
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(startSec),
        "-i",
        inputPath,
        "-t",
        String(durationSec),
        "-vn",
        "-map",
        "0:a",
        "-c:a",
        "libopus",
        "-b:a",
        "48k",
        webmOut,
      ],
      { maxBuffer: 50 * 1024 * 1024 }
    );
    return webmOut;
  }
}

/**
 * Split `buffer` into two contiguous time segments of equal duration (for VBR oversize recovery).
 */
async function splitBufferInHalf(
  ffmpegPath: string,
  buffer: Buffer,
  workDir: string,
  baseName: string
): Promise<[Buffer, Buffer]> {
  // Extension-agnostic name — ffmpeg probes container/codec from content.
  const inputPath = path.join(workDir, `${baseName}-half-src.bin`);
  await fs.writeFile(inputPath, buffer);
  const dur = await probeDurationSeconds(ffmpegPath, inputPath);
  const half = dur / 2;
  const outA = path.join(workDir, `${baseName}-a.bin`);
  const outB = path.join(workDir, `${baseName}-b.bin`);
  const pathA = await extractSegment(ffmpegPath, inputPath, 0, half, outA);
  const pathB = await extractSegment(ffmpegPath, inputPath, half, dur - half, outB);
  return [await fs.readFile(pathA), await fs.readFile(pathB)];
}

/**
 * Recursively ensure chunks are <= WHISPER_MAX_BYTES by bisecting time when VBR makes a slice too large.
 */
async function ensureChunksUnderLimit(
  ffmpegPath: string,
  buffers: Buffer[],
  workDir: string,
  depth: number
): Promise<Buffer[]> {
  if (depth > 24) {
    throw new Error("Audio split depth exceeded (file may be corrupt).");
  }
  const out: Buffer[] = [];
  for (let i = 0; i < buffers.length; i++) {
    const buf = buffers[i];
    if (buf.length <= WHISPER_MAX_BYTES) {
      out.push(buf);
      continue;
    }
    const [a, b] = await splitBufferInHalf(ffmpegPath, buf, workDir, `bisect-${depth}-${i}`);
    out.push(...(await ensureChunksUnderLimit(ffmpegPath, [a, b], workDir, depth + 1)));
  }
  return out;
}

/**
 * When audio exceeds Whisper's per-request size limit, split into time-based segments with ffmpeg,
 * then bisect any segment that is still too large (VBR).
 *
 * Requires `ffmpeg` on PATH (`FFMPEG_BIN`) or the `ffmpeg-static` binary from npm.
 */
export async function splitAudioIntoWhisperParts(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<WhisperAudioPart[]> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    throw new Error("ffmpeg is not available (set FFMPEG_BIN or install ffmpeg-static).");
  }

  const ext = extFromMimeOrFilename(mimeType, filename);
  const base = filename.replace(/\.[^.]+$/, "") || "session";

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tn-whisper-"));
  try {
    const inputPath = path.join(tmpRoot, `input.${ext}`);
    await fs.writeFile(inputPath, buffer);

    const durationSec = await probeDurationSeconds(ffmpegPath, inputPath);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error("Invalid or zero duration.");
    }

    let segmentCount = Math.max(1, Math.ceil(buffer.length / CHUNK_TARGET_BYTES));
    const segmentDuration = durationSec / segmentCount;

    const initial: Buffer[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const start = i * segmentDuration;
      const outPath = path.join(tmpRoot, `chunk-${i}.${ext}`);
      const actualPath = await extractSegment(ffmpegPath, inputPath, start, segmentDuration, outPath);
      initial.push(await fs.readFile(actualPath));
    }

    const finalBuffers = await ensureChunksUnderLimit(ffmpegPath, initial, tmpRoot, 0);

    const isEbmlWebM = (buf: Buffer) =>
      buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;

    return finalBuffers.map((b, i) => {
      const webm = isEbmlWebM(b);
      return {
        buffer: b,
        filename: `${base}-part${i + 1}.${webm ? "webm" : ext}`,
        mimeType: webm ? "audio/webm;codecs=opus" : baseMime(mimeType),
      };
    });
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
