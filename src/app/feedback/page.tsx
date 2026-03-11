import Link from "next/link";
import { submitFeedback } from "./actions";

export const dynamic = "force-dynamic";

export default function FeedbackPage() {
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>Feedback</h1>
          <Link className="btn" href="/">
            Home
          </Link>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          This app stores feedback locally (so the pipeline can pick it up later
          once a deploy target exists).
        </p>

        <div className="divider" />

        <form action={submitFeedback}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 220 }}>
              <label>Type</label>
              <select name="kind" defaultValue="FEEDBACK">
                <option value="FEEDBACK">Feedback</option>
                <option value="BUG">Bug report</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label>Message</label>
            <textarea
              name="message"
              rows={6}
              placeholder="What should be improved? What went wrong?"
              required
            />
          </div>

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn primary" type="submit">
              Send
            </button>
          </div>
        </form>

        <p className="muted" style={{ marginTop: 12 }}>
          Admins can view feedback at <code>/admin/feedback</code>.
        </p>
      </div>
    </div>
  );
}

