/**
 * localStorage persistence for tutor mic preferences.
 *
 * Centralised so the keys, defaults, and clamp ranges live in one place. All
 * loaders are SSR-safe (return defaults when `window` is undefined). Savers
 * are no-ops on the server. None of these throw — a quota error or disabled
 * storage degrades to "preference not remembered next session".
 */

export const GAIN_MIN = 0.25;
export const GAIN_MAX = 3.0;
export const GAIN_DEFAULT = 1.0;

export const CHIME_VOL_MIN = 0.05;
export const CHIME_VOL_MAX = 1;
export const CHIME_VOL_DEFAULT = 0.75;

export const STORAGE_DEVICE_KEY = "tn-mic-device-id";
export const STORAGE_GAIN_KEY = "tn-mic-gain";
/** Whether to play the approaching-cap + rollover chimes (also gates vibration). */
export const STORAGE_CHIME_ENABLED_KEY = "tn-recording-chime-enabled";
/** 0.05–1.0 — scales chime loudness (stored as string float). */
export const STORAGE_CHIME_VOLUME_KEY = "tn-recording-chime-volume";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadStoredGain(): number {
  const s = getStorage();
  if (!s) return GAIN_DEFAULT;
  const raw = s.getItem(STORAGE_GAIN_KEY);
  if (!raw) return GAIN_DEFAULT;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < GAIN_MIN || n > GAIN_MAX) return GAIN_DEFAULT;
  return n;
}

export function saveStoredGain(value: number): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_GAIN_KEY, String(value));
  } catch {
    /* quota / private mode — best-effort */
  }
}

export function loadStoredDeviceId(): string {
  const s = getStorage();
  if (!s) return "";
  return s.getItem(STORAGE_DEVICE_KEY) ?? "";
}

export function saveStoredDeviceId(id: string): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_DEVICE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadStoredChimeEnabled(): boolean {
  const s = getStorage();
  if (!s) return true;
  const v = s.getItem(STORAGE_CHIME_ENABLED_KEY);
  if (v === null) return true;
  return v === "1" || v === "true";
}

export function saveStoredChimeEnabled(enabled: boolean): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_CHIME_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadStoredChimeVolume(): number {
  const s = getStorage();
  if (!s) return CHIME_VOL_DEFAULT;
  const raw = s.getItem(STORAGE_CHIME_VOLUME_KEY);
  if (!raw) return CHIME_VOL_DEFAULT;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < CHIME_VOL_MIN || n > CHIME_VOL_MAX) {
    return CHIME_VOL_DEFAULT;
  }
  return n;
}

export function saveStoredChimeVolume(value: number): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_CHIME_VOLUME_KEY, String(value));
  } catch {
    /* ignore */
  }
}
