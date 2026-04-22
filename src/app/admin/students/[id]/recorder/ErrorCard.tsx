"use client";

export type ErrorCardProps = {
  /** Human-readable error message. Falsy values render no `<p>` (just the button). */
  error: string | null;
  /** Click handler for the Try again button — typically `r.handleReset`. */
  onReset: () => void;
};

/**
 * Error state for the recorder. Wraps the message in a `role="alert"` so AT
 * users hear it on first paint, and keeps the Try-again button below.
 */
export default function ErrorCard({ error, onReset }: ErrorCardProps) {
  return (
    <div data-testid="audio-record-panel">
      {error && (
        <p
          role="alert"
          style={{ fontSize: 13, color: "var(--color-error, #dc2626)", margin: "0 0 10px" }}
          data-testid="audio-record-error"
        >
          {error}
        </p>
      )}
      <button type="button" className="btn" onClick={onReset}>
        Try again
      </button>
    </div>
  );
}
