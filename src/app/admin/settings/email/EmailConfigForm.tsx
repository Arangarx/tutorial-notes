"use client";

import { useState } from "react";
import { saveEmailConfig } from "./actions";

export default function EmailConfigForm({
  defaultHost,
  defaultPort,
  defaultSecure,
  defaultUser,
  defaultFromEmail,
}: {
  defaultHost: string;
  defaultPort: number | undefined;
  defaultSecure: boolean;
  defaultUser: string;
  defaultFromEmail: string;
}) {
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
          await saveEmailConfig(formData);
          setSaved(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to save");
        }
      }}
    >
      <div style={{ display: "grid", gap: 12, maxWidth: 400 }}>
        <div>
          <label htmlFor="smtp-host">SMTP host</label>
          <input
            id="smtp-host"
            name="host"
            type="text"
            placeholder="smtp.resend.com"
            defaultValue={defaultHost}
            required
          />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div>
            <label htmlFor="smtp-port">Port</label>
            <input
              id="smtp-port"
              name="port"
              type="number"
              placeholder="587"
              defaultValue={defaultPort}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <label>
              <input
                type="checkbox"
                name="secure"
                value="true"
                defaultChecked={defaultSecure}
              />{" "}
              TLS (secure)
            </label>
          </div>
        </div>
        <div>
          <label htmlFor="smtp-user">Username</label>
          <input
            id="smtp-user"
            name="user"
            type="text"
            placeholder="resend"
            defaultValue={defaultUser}
            required
          />
        </div>
        <div>
          <label htmlFor="smtp-password">Password (API key or app password)</label>
          <input
            id="smtp-password"
            name="password"
            type="password"
            placeholder={defaultUser ? "Leave blank to keep current" : ""}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="smtp-from">From address (optional)</label>
          <input
            id="smtp-from"
            name="fromEmail"
            type="email"
            placeholder="noreply@yourdomain.com"
            defaultValue={defaultFromEmail}
          />
        </div>
      </div>
      {saved && <p style={{ color: "#90ee90", marginTop: 12 }}>Settings saved.</p>}
      {error && <p style={{ color: "#ffb4b4", marginTop: 12 }}>{error}</p>}
      <div style={{ marginTop: 16 }}>
        <button className="btn primary" type="submit">
          Save email settings
        </button>
      </div>
    </form>
  );
}
