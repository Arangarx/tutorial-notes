import { DESMOS_ALLOWED_HOSTS } from "@/lib/whiteboard/insert-asset";

/**
 * Excalidraw `validateEmbeddable` for iframe embeds. The CSP
 * `frame-src` in `next.config.ts` is the real boundary; this only
 * controls Excalidraw's in-app "trusted source" panel.
 */
export function validateExcalidrawEmbeddable(url: string): true | undefined {
  try {
    const parsed = new URL(url);
    if (DESMOS_ALLOWED_HOSTS.includes(parsed.hostname)) return true;
  } catch {
    // fall through
  }
  return undefined;
}
