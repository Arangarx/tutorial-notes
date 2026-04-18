"use client";

import { useRef, useState } from "react";
import { uploadAudioAction } from "./actions";
import { ACCEPTED_AUDIO_TYPES, BLOB_MAX_BYTES } from "@/lib/audio-constants";

const ACCEPTED_ATTR = ACCEPTED_AUDIO_TYPES.join(",");
const MAX_MB = Math.round(BLOB_MAX_BYTES / 1024 / 1024);

export type UploadedAudio = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
  previewUrl?: string;
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

    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadAudioAction(studentId, formData);

      if (!result.ok) {
        setError(result.error);
        setState("error");
        return;
      }

      setState("done");
      const previewUrl = URL.createObjectURL(file);
      onUploaded({
        blobUrl: result.blobUrl,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        filename: file.name,
        previewUrl,
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
            <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--color-muted, #6b7280)" }}>
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
                  width: "40%",
                  background: "var(--color-primary, #2563eb)",
                  borderRadius: 3,
                  animation: "uploadSweep 1.2s ease-in-out infinite",
                }}
              />
            </div>
            <style>{`
              @keyframes uploadSweep {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(350%); }
              }
            `}</style>
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
