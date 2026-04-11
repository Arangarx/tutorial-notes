"use client";

import { useState } from "react";

export function ShareLinkRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
