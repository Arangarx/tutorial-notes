"use client";

import { useSyncExternalStore } from "react";

type ExcalidrawTheme = "light" | "dark";

function getSnapshot(): ExcalidrawTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** SSR / first paint: prefer light so we never default the whiteboard to dark. */
function getServerSnapshot(): ExcalidrawTheme {
  return "light";
}

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/**
 * Drives Excalidraw's `theme` from `prefers-color-scheme` so we don't force
 * dark mode on the board; the canvas follows the visitor's system setting
 * and updates if they change it (e.g. scheduled dark mode on mobile).
 */
export function useExcalidrawThemeFromSystem(): ExcalidrawTheme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
