/**
 * Round-trip tests for the persisted mic preferences. Uses an in-memory
 * Storage stub so we can run in node without polluting jsdom.
 */

import {
  GAIN_DEFAULT,
  GAIN_MAX,
  GAIN_MIN,
  CHIME_VOL_DEFAULT,
  CHIME_VOL_MAX,
  CHIME_VOL_MIN,
  STORAGE_DEVICE_KEY,
  STORAGE_GAIN_KEY,
  STORAGE_CHIME_ENABLED_KEY,
  STORAGE_CHIME_VOLUME_KEY,
  loadStoredGain,
  saveStoredGain,
  loadStoredDeviceId,
  saveStoredDeviceId,
  loadStoredChimeEnabled,
  saveStoredChimeEnabled,
  loadStoredChimeVolume,
  saveStoredChimeVolume,
} from "@/lib/recording/storage";

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  const storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

function getStored(key: string): string | null {
  const w = (globalThis as unknown as { window?: { localStorage: MemoryStorage } }).window;
  return w?.localStorage.getItem(key) ?? null;
}

describe("loadStoredGain / saveStoredGain", () => {
  test("default when nothing stored", () => {
    expect(loadStoredGain()).toBe(GAIN_DEFAULT);
  });

  test("round-trips a valid value", () => {
    saveStoredGain(1.75);
    expect(loadStoredGain()).toBe(1.75);
    expect(getStored(STORAGE_GAIN_KEY)).toBe("1.75");
  });

  test("clamps junk to default (NaN, out-of-range)", () => {
    const w = (globalThis as unknown as { window?: { localStorage: MemoryStorage } }).window!;
    w.localStorage.setItem(STORAGE_GAIN_KEY, "not-a-number");
    expect(loadStoredGain()).toBe(GAIN_DEFAULT);
    w.localStorage.setItem(STORAGE_GAIN_KEY, String(GAIN_MIN - 0.01));
    expect(loadStoredGain()).toBe(GAIN_DEFAULT);
    w.localStorage.setItem(STORAGE_GAIN_KEY, String(GAIN_MAX + 0.01));
    expect(loadStoredGain()).toBe(GAIN_DEFAULT);
  });
});

describe("loadStoredDeviceId / saveStoredDeviceId", () => {
  test("default empty string", () => {
    expect(loadStoredDeviceId()).toBe("");
  });

  test("round-trips a device id", () => {
    saveStoredDeviceId("usb-mic-42");
    expect(loadStoredDeviceId()).toBe("usb-mic-42");
    expect(getStored(STORAGE_DEVICE_KEY)).toBe("usb-mic-42");
  });
});

describe("loadStoredChimeEnabled / saveStoredChimeEnabled", () => {
  test("default true (chime on for new tutors)", () => {
    expect(loadStoredChimeEnabled()).toBe(true);
  });

  test("round-trips false", () => {
    saveStoredChimeEnabled(false);
    expect(loadStoredChimeEnabled()).toBe(false);
    expect(getStored(STORAGE_CHIME_ENABLED_KEY)).toBe("0");
  });

  test("round-trips true", () => {
    saveStoredChimeEnabled(true);
    expect(loadStoredChimeEnabled()).toBe(true);
    expect(getStored(STORAGE_CHIME_ENABLED_KEY)).toBe("1");
  });

  test("accepts legacy 'true' string for back-compat", () => {
    const w = (globalThis as unknown as { window?: { localStorage: MemoryStorage } }).window!;
    w.localStorage.setItem(STORAGE_CHIME_ENABLED_KEY, "true");
    expect(loadStoredChimeEnabled()).toBe(true);
  });
});

describe("loadStoredChimeVolume / saveStoredChimeVolume", () => {
  test("default when nothing stored", () => {
    expect(loadStoredChimeVolume()).toBe(CHIME_VOL_DEFAULT);
  });

  test("round-trips a valid value", () => {
    saveStoredChimeVolume(0.4);
    expect(loadStoredChimeVolume()).toBe(0.4);
    expect(getStored(STORAGE_CHIME_VOLUME_KEY)).toBe("0.4");
  });

  test("clamps out-of-range / NaN to default", () => {
    const w = (globalThis as unknown as { window?: { localStorage: MemoryStorage } }).window!;
    w.localStorage.setItem(STORAGE_CHIME_VOLUME_KEY, "not-a-number");
    expect(loadStoredChimeVolume()).toBe(CHIME_VOL_DEFAULT);
    w.localStorage.setItem(STORAGE_CHIME_VOLUME_KEY, String(CHIME_VOL_MIN - 0.001));
    expect(loadStoredChimeVolume()).toBe(CHIME_VOL_DEFAULT);
    w.localStorage.setItem(STORAGE_CHIME_VOLUME_KEY, String(CHIME_VOL_MAX + 0.001));
    expect(loadStoredChimeVolume()).toBe(CHIME_VOL_DEFAULT);
  });
});

describe("SSR / no-window safety", () => {
  beforeEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  test("loaders return defaults when window is undefined", () => {
    expect(loadStoredGain()).toBe(GAIN_DEFAULT);
    expect(loadStoredDeviceId()).toBe("");
    expect(loadStoredChimeEnabled()).toBe(true);
    expect(loadStoredChimeVolume()).toBe(CHIME_VOL_DEFAULT);
  });

  test("savers no-op without throwing when window is undefined", () => {
    expect(() => saveStoredGain(1)).not.toThrow();
    expect(() => saveStoredDeviceId("x")).not.toThrow();
    expect(() => saveStoredChimeEnabled(true)).not.toThrow();
    expect(() => saveStoredChimeVolume(0.5)).not.toThrow();
  });
});

describe("quota / write failures", () => {
  test("savers swallow throwing setItem (quota / private mode)", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceeded");
        },
        removeItem: () => {},
      },
    };
    expect(() => saveStoredGain(1)).not.toThrow();
    expect(() => saveStoredDeviceId("x")).not.toThrow();
    expect(() => saveStoredChimeEnabled(true)).not.toThrow();
    expect(() => saveStoredChimeVolume(0.5)).not.toThrow();
  });
});
