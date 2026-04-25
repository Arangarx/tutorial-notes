"use client";

import { copyTextToClipboard } from "@/lib/copy-text-to-clipboard";
import { useState } from "react";

export function ShareLinkRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyTextToClipboard(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Prompt cancel or total failure — no toast here; parent is minimal.
    }
  }

  return (
    <div className="row">
      <input readOnly value={url} style={{ flex: 1 }} />
      <button className="btn" type="button" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy"}
      </button>
      <a className="btn" href={url} target="_blank" rel="noreferrer">
        Open
      </a>
    </div>
  );
}
