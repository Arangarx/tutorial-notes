"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ACCEPTED_AUDIO_TYPES, BLOB_MAX_BYTES } from "@/lib/audio-constants";

const ACCEPTED_ATTR = ACCEPTED_AUDIO_TYPES.join(",");
const MAX_MB = Math.round(BLOB_MAX_BYTES / 1024 / 1024);

export type UploadedAudio = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
};

type Props = {
  studentId: string;
  onUploaded: (audio: UploadedAudio) => void;
  disabled?: boolean;
};

type UploadState = "idle" | "uploading" | "done" | "error";

export default function AudioUploadInput({ studentId, onUploaded, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!file.type || !ACCEPTED_AUDIO_TYPES.some((t) => file.type.startsWith(t.split(";")[0]))) {
      setError(`Unsupported file type: ${file.type || "unknown"}. Please upload an audio file.`);
      return;
    }

    if (file.size > BLOB_MAX_BYTES) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_MB} MB.`);
      return;
    }

    setFilename(file.name);
    setState("uploading");
    setProgress(0);

    try {
      const result = await upload(
        `sessions/${studentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/upload/audio",
          clientPayload: studentId,
          onUploadProgress: (e) => {
            setProgress(Math.round(e.percentage));
          },
        }
      );

      setState("done");
      onUploaded({
        blobUrl: result.url,
        mimeType: file.type,
        sizeBytes: file.size,
        filename: file.name,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      setState("error");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleReset() {
    setState("idle");
    setProgress(0);
    setError(null);
    setFilename(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (state === "done") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: "var(--color-success-bg, #f0fdf4)",
          borderRadius: 6,
          border: "1px solid var(--color-success-border, #bbf7d0)",
        }}
        data-testid="audio-upload-done"
      >
        <span style={{ color: "var(--color-success, #16a34a)", fontWeight: 600, fontSize: 14 }}>
          ✓ {filename ?? "Audio uploaded"}
        </span>
        <button
          type="button"
          className="btn"
          style={{ marginLeft: "auto", fontSize: 12 }}
          onClick={handleReset}
        >
          Replace
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !disabled && state !== "uploading" && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        data-testid="audio-upload-dropzone"
        style={{
          border: "2px dashed var(--color-border, #d1d5db)",
          borderRadius: 8,
          padding: "20px 16px",
          textAlign: "center",
          cursor: disabled || state === "uploading" ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition: "border-color 0.2s",
        }}
      >
        {state === "uploading" ? (
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--color-muted, #6b7280)" }}>
              Uploading {filename}…
            </p>
            <div
              style={{
                height: 6,
                background: "var(--color-border, #e5e7eb)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--color-primary, #2563eb)",
                  transition: "width 0.2s",
                  borderRadius: 3,
                }}
              />
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
              {progress}%
            </p>
          </div>
        ) : (
          <>
            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>
              Drop audio file here or click to browse
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
              MP3, MP4, M4A, WebM, OGG, WAV · up to {MAX_MB} MB
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_ATTR}
        style={{ display: "none" }}
        onChange={handleChange}
        disabled={disabled || state === "uploading"}
        data-testid="audio-file-input"
      />

      {error && (
        <p
          style={{ marginTop: 8, fontSize: 13, color: "var(--color-error, #dc2626)" }}
          data-testid="audio-upload-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
