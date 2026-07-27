"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  isThemeMode,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    /* localStorage blocked */
  }
  return "system";
}

function readInitialResolvedTheme(mode: ThemeMode): ResolvedTheme {
  if (typeof document === "undefined") return resolveTheme(mode);
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return resolveTheme(mode);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with SSR-safe defaults so server and client first renders match
  // (avoiding React hydration error #418). The useEffect below syncs with
  // localStorage on mount; the resulting flash is imperceptible because
  // applyThemeToDocument also updates the <html data-theme> attribute.
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  // Sync with stored preference after hydration.
  useEffect(() => {
    const storedMode = readStoredMode();
    const initialResolved = readInitialResolvedTheme(storedMode);
    setModeState(storedMode);
    setResolvedTheme(initialResolved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* localStorage blocked */
    }
    setResolvedTheme(applyThemeToDocument(next));
  }, []);

  useEffect(() => {
    setResolvedTheme(applyThemeToDocument(mode));
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setResolvedTheme(applyThemeToDocument("system"));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const value = useMemo(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
