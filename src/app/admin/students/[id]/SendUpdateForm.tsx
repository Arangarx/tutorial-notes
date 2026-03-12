"use client";

import { useActionState } from "react";
import { sendUpdateEmail, type SendUpdateResult } from "./actions";

export default function SendUpdateForm({
  studentId,
  defaultToEmail,
}: {
  studentId: string;
  defaultToEmail: string | null;
}) {
  const [state, formAction] = useActionState(sendUpdateEmail, null as SendUpdateResult | null);

  return (
    <>
      <form action={formAction}>
        <input type="hidden" name="studentId" value={studentId} />
        <label htmlFor="toEmail">To (parent/guardian email)</label>
        <input
          id="toEmail"
          name="toEmail"
          type="email"
          placeholder="parent@example.com"
          defaultValue={defaultToEmail ?? ""}
          required
        />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn primary" type="submit">
            Send
          </button>
        </div>
      </form>
      {state?.ok === true && state.sent && (
        <p style={{ color: "#90ee90", marginTop: 12 }}>
          Sent to {state.toEmail}. They’ll receive the link in their inbox (check junk if not).
        </p>
      )}
      {state?.ok === true && state.outboxOnly && (
        <p style={{ color: "#ffd700", marginTop: 12 }}>
          Email is not configured. Message saved to outbox — copy the share link from above or from{" "}
          <a href="/admin/outbox">Outbox</a> to send it yourself. To actually send email, add SMTP
          settings to your server environment.
        </p>
      )}
      {state?.ok === true && state.error && !state.sent && !state.outboxOnly && (
        <p style={{ color: "#ffb4b4", marginTop: 12 }}>
          Failed to send: {state.error}. Message saved to outbox — you can copy the link and send
          manually.
        </p>
      )}
      {state?.ok === false && state.error && (
        <p style={{ color: "#ffb4b4", marginTop: 12 }}>{state.error}</p>
      )}
    </>
  );
}
