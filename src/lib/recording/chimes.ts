/**
 * Audible cues for the segment timer.
 *
 * Two distinct chimes:
 *   - playApproachingMaxTimeChime — two-tone (880Hz then 660Hz). Plays once
 *     when the segment crosses WARN_SEGMENT_SECONDS.
 *   - playSegmentRolloverChime — single soft C5. Plays right before
 *     auto-rollover so the tutor knows a save just happened.
 *
 * Both fail silently if AudioContext is unavailable; both clamp volume into
 * the 0.05–1 range used by the persisted preference. The optional
 * `audioContextFactory` param exists so node tests can inject a fake AC and
 * assert the schedule of oscillators / gain values — no real audio device
 * needed.
 */

/**
 * Base master gain; multiplied by user `volume` (0.05–1). Tuned so that the
 * default volume (0.75) is audible across a tutor's voice mid-conversation
 * without being startling — bumped after a real-world test where the chime
 * went unheard while the tutor was talking.
 */
export const CHIME_BASE_GAIN = 0.22;

/**
 * Resolves an AudioContext constructor from `window`, including the legacy
 * webkit prefix that Safari still requires in some embedded contexts.
 */
function defaultAudioContextFactory(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  try {
    return new AC();
  } catch {
    return null;
  }
}

export type AudioContextFactory = () => AudioContext | null;

/** Clamp a chime volume into the persisted-preference range. */
function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0.05, volume));
}

/**
 * Short, gentle two-tone chime when approaching the segment cap (warning
 * label is already on screen; this is the audible cue).
 *
 * @param volume 0 = silent (also skips vibration). 0.05–1 scales loudness.
 */
export function playApproachingMaxTimeChime(
  volume: number,
  audioContextFactory: AudioContextFactory = defaultAudioContextFactory
): void {
  if (volume <= 0) return;
  try {
    const ctx = audioContextFactory();
    if (!ctx) return;
    const master = ctx.createGain();
    master.gain.value = CHIME_BASE_GAIN * clampVolume(volume);
    master.connect(ctx.destination);

    const tone = (freq: number, t0: number, dur: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(1, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };

    const t0 = ctx.currentTime;
    tone(880, t0, 0.11);
    tone(660, t0 + 0.13, 0.12);
    void ctx.resume();

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([70, 35, 70]);
    }
  } catch {
    /* ignore */
  }
}

/** Soft single-note cue right before an automatic segment rollover. */
export function playSegmentRolloverChime(
  volume: number,
  audioContextFactory: AudioContextFactory = defaultAudioContextFactory
): void {
  if (volume <= 0) return;
  try {
    const ctx = audioContextFactory();
    if (!ctx) return;
    const master = ctx.createGain();
    master.gain.value = CHIME_BASE_GAIN * 0.55 * clampVolume(volume);
    master.connect(ctx.destination);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 523.25; // C5
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(g);
    g.connect(master);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    void ctx.resume();
  } catch {
    /* ignore */
  }
}
