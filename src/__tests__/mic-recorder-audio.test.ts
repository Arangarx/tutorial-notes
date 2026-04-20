/**
 * Unit tests for the Web Audio helper used by the in-browser recorder.
 *
 * Covers:
 *  - Returns null gracefully when AudioContext is unavailable (test envs / old browsers).
 *  - Returns the expected shape (recordingStream, dispose, getLevel, setGain).
 *  - setGain forwards to the GainNode without rebuilding the graph.
 *  - dispose stops the mic tracks and closes the AudioContext.
 */

import { createMicAudioGraph } from "@/lib/mic-recorder-audio";

type GainParam = { value: number };
type FakeNode = { connect: jest.Mock };

function fakeMicStream() {
  const track = { stop: jest.fn() };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    track,
  };
}

describe("createMicAudioGraph", () => {
  const originalAudioContext = (globalThis as { AudioContext?: unknown }).AudioContext;

  afterEach(() => {
    if (originalAudioContext === undefined) {
      delete (globalThis as { AudioContext?: unknown }).AudioContext;
    } else {
      (globalThis as { AudioContext?: unknown }).AudioContext = originalAudioContext;
    }
  });

  test("returns null when AudioContext is missing (allows raw-stream fallback)", async () => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1);
    expect(graph).toBeNull();
  });

  test("returns null when AudioContext throws (e.g. test stub stream)", async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = function FailingCtx() {
      throw new Error("no audio ctx in test env");
    };
    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1);
    expect(graph).toBeNull();
  });

  test("happy path: builds graph, exposes setGain/getLevel/dispose, cleans up", async () => {
    const gainParam: GainParam = { value: 0 };
    const sourceNode: FakeNode = { connect: jest.fn() };
    const gainNode = { gain: gainParam, connect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn((arr: Float32Array) => {
        // Inject a small amplitude so getLevel returns > 0.
        for (let i = 0; i < arr.length; i++) arr[i] = 0.1;
      }),
    };
    const destinationStream = { id: "destination-stream" };
    const close = jest.fn().mockResolvedValue(undefined);
    const resume = jest.fn().mockResolvedValue(undefined);

    const ctx = {
      createMediaStreamSource: jest.fn(() => sourceNode),
      createGain: jest.fn(() => gainNode),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => ({ stream: destinationStream })),
      resume,
      close,
    };

    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1.5);

    expect(graph).not.toBeNull();
    expect(resume).toHaveBeenCalled();
    expect(ctx.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(gainParam.value).toBe(1.5);
    // source -> gain, gain -> destination, gain -> analyser
    expect(sourceNode.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledTimes(2);

    // recordingStream should be the destination's stream (not the raw mic).
    expect(graph!.recordingStream).toBe(destinationStream);

    // Level should reflect the amplitude we injected.
    const level = graph!.getLevel();
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThanOrEqual(1);

    // setGain updates the live param without rebuilding.
    graph!.setGain(0.75);
    expect(gainParam.value).toBe(0.75);

    // Negative gains clamp to 0 (defensive).
    graph!.setGain(-0.5);
    expect(gainParam.value).toBe(0);

    // dispose stops the mic and closes the context.
    graph!.dispose();
    expect(stream.track.stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
