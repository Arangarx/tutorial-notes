/**
 * Audible-cue tests run in node by injecting a fake AudioContext factory.
 *
 * We don't assert exact dB / waveform shapes — those tuning details are
 * documented in the source. Instead we lock the contract that callers and
 * the recorder hook depend on:
 *  - volume <= 0 short-circuits (silent + no vibration)
 *  - missing AudioContext factory short-circuits without throwing
 *  - factory failures are swallowed
 *  - the approaching chime fires two oscillators (the two-tone sequence)
 *  - the rollover chime fires one oscillator
 *  - master gain is positive when volume > 0 (so the cue is actually audible)
 */

import {
  CHIME_BASE_GAIN,
  playApproachingMaxTimeChime,
  playSegmentRolloverChime,
} from "@/lib/recording/chimes";

type FakeOscillator = {
  type: OscillatorType;
  frequency: { value: number };
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
};

type FakeGain = {
  gain: {
    value: number;
    setValueAtTime: jest.Mock;
    exponentialRampToValueAtTime: jest.Mock;
  };
  connect: jest.Mock;
};

type FakeAudioContext = {
  currentTime: number;
  destination: object;
  createGain: jest.Mock<FakeGain, []>;
  createOscillator: jest.Mock<FakeOscillator, []>;
  resume: jest.Mock<Promise<void>, []>;
  oscillators: FakeOscillator[];
  gains: FakeGain[];
};

function makeFakeAudioContext(): FakeAudioContext {
  const oscillators: FakeOscillator[] = [];
  const gains: FakeGain[] = [];
  const ctx: FakeAudioContext = {
    currentTime: 0,
    destination: {},
    createGain: jest.fn(() => {
      const g: FakeGain = {
        gain: {
          value: 0,
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
        connect: jest.fn(),
      };
      gains.push(g);
      return g;
    }),
    createOscillator: jest.fn(() => {
      const o: FakeOscillator = {
        type: "sine",
        frequency: { value: 0 },
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      };
      oscillators.push(o);
      return o;
    }),
    resume: jest.fn(async () => {}),
    oscillators,
    gains,
  };
  return ctx;
}

describe("playApproachingMaxTimeChime", () => {
  test("does nothing when volume is 0", () => {
    const ctx = makeFakeAudioContext();
    playApproachingMaxTimeChime(0, () => ctx as unknown as AudioContext);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  test("does nothing when factory returns null (no AudioContext available)", () => {
    expect(() =>
      playApproachingMaxTimeChime(1, () => null)
    ).not.toThrow();
  });

  test("swallows factory throw (defensive — never crashes the recorder)", () => {
    expect(() =>
      playApproachingMaxTimeChime(1, () => {
        throw new Error("AC blew up");
      })
    ).not.toThrow();
  });

  test("schedules two tones (880Hz then 660Hz) at default volume", () => {
    const ctx = makeFakeAudioContext();
    playApproachingMaxTimeChime(0.75, () => ctx as unknown as AudioContext);
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.oscillators[0].frequency.value).toBe(880);
    expect(ctx.oscillators[1].frequency.value).toBe(660);
    expect(ctx.resume).toHaveBeenCalled();
  });

  test("master gain scales with volume (and is non-zero so user can hear it)", () => {
    const ctx = makeFakeAudioContext();
    playApproachingMaxTimeChime(0.75, () => ctx as unknown as AudioContext);
    // First gain created is the master.
    expect(ctx.gains[0].gain.value).toBeGreaterThan(0);
    expect(ctx.gains[0].gain.value).toBeCloseTo(CHIME_BASE_GAIN * 0.75, 5);
  });

  test("clamps low volume up to the audibility floor (0.05) so 'on' isn't silent", () => {
    const ctx = makeFakeAudioContext();
    playApproachingMaxTimeChime(0.01, () => ctx as unknown as AudioContext);
    expect(ctx.gains[0].gain.value).toBeCloseTo(CHIME_BASE_GAIN * 0.05, 5);
  });
});

describe("playSegmentRolloverChime", () => {
  test("does nothing when volume is 0", () => {
    const ctx = makeFakeAudioContext();
    playSegmentRolloverChime(0, () => ctx as unknown as AudioContext);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  test("plays a single C5 tone", () => {
    const ctx = makeFakeAudioContext();
    playSegmentRolloverChime(0.75, () => ctx as unknown as AudioContext);
    expect(ctx.oscillators).toHaveLength(1);
    expect(ctx.oscillators[0].frequency.value).toBeCloseTo(523.25, 2);
    expect(ctx.resume).toHaveBeenCalled();
  });

  test("rollover chime is quieter than the warning chime at the same volume", () => {
    const warn = makeFakeAudioContext();
    const roll = makeFakeAudioContext();
    playApproachingMaxTimeChime(1, () => warn as unknown as AudioContext);
    playSegmentRolloverChime(1, () => roll as unknown as AudioContext);
    expect(roll.gains[0].gain.value).toBeLessThan(warn.gains[0].gain.value);
  });

  test("does nothing when factory returns null", () => {
    expect(() => playSegmentRolloverChime(1, () => null)).not.toThrow();
  });
});
