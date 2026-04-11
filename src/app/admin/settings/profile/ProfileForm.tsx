"use client";

import { useState } from "react";
import { saveProfileDisplayName } from "./actions";

export default function ProfileForm({ defaultDisplayName }: { defaultDisplayName: string }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        const formData = new FormData(e.currentTarget as HTMLFormElement);
        try {
          await saveProfileDisplayName(formData);
          setSaved(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save");
        }
      }}
    >
      <div style={{ maxWidth: 400 }}>
        <label htmlFor="displayName">Your name (shown to parents in emails)</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder="e.g. Alex Chen"
          defaultValue={defaultDisplayName}
        />
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          This appears as the sender name when you email session updates. Use your real name or how you
          introduce yourself to families.
        </p>
      </div>
      {saved && <p style={{ color: "#90ee90", marginTop: 12 }}>Saved.</p>}
      {error && <p style={{ color: "#ffb4b4", marginTop: 12 }}>{error}</p>}
      <div style={{ marginTop: 16 }}>
        <button className="btn primary" type="submit">
          Save profile
        </button>
      </div>
    </form>
  );
}
