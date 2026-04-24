"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const Inner = dynamic(
  async () => {
    const mod = await import("@excalidraw/excalidraw");
    await import("@excalidraw/excalidraw/index.css");
    return mod.Excalidraw as ComponentType<Record<string, unknown>>;
  },
  {
    ssr: false,
    loading: () => (
      <div
        className="card"
        style={{
          minHeight: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="muted">Loading whiteboard…</div>
      </div>
    ),
  }
);

/**
 * Client-only Excalidraw (large bundle) shared by the tutor workspace
 * and the student join page. Never SSR the heavy bundle.
 */
export function ExcalidrawDynamic(
  props: Readonly<Record<string, unknown>>
) {
  return <Inner {...props} />;
}
