/** Production theme preference — persisted in localStorage. */
export const THEME_STORAGE_KEY = "mynk-theme";

/** Dev-only persistence when `?theme=` is used (legacy ThemeInit compat). */
export const DEV_THEME_STORAGE_KEY = "tutoring-notes-dev-theme";

export type ThemeMode = "light" | "dark" | "system";

/** Resolved palette — always light or dark (system maps via matchMedia). */
export type ResolvedTheme = "light" | "dark";

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function isResolvedTheme(value: string | null | undefined): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

export function getSystemResolvedTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  return getSystemResolvedTheme();
}

/** Apply mode to `<html data-theme>` — always writes resolved light|dark. */
export function applyThemeToDocument(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute("data-theme", resolved);
  return resolved;
}

/**
 * Blocking bootstrap script (inlined in layout `<head>`).
 * Must stay in sync with `applyThemeToDocument` semantics.
 */
export function getThemeBootstrapScript(): string {
  return `(function(){try{var d=document.documentElement;var p=new URLSearchParams(window.location.search);var u=p.get("theme");if(u==="light"||u==="dark"){d.setAttribute("data-theme",u);try{localStorage.setItem(${JSON.stringify(DEV_THEME_STORAGE_KEY)},u)}catch(e){}return}var m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var r;if(m==="light"||m==="dark"){r=m}else{r=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.setAttribute("data-theme",r)}catch(e){}})();`;
}
