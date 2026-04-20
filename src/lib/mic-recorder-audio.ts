/**
 * Web Audio helpers for in-browser recording: optional gain + level metering.
 * Falls back to the raw MediaStream if Web Audio is unavailable or throws
 * (e.g. tests with a stub MediaStream).
 */

export type MicAudioGraph = {
  /** Stream to pass to MediaRecorder (processed). */
  recordingStream: MediaStream;
  /** Call when done to release the mic and audio context. */
  dispose: () => void;
  /** RMS-ish level 0..1 for UI meter; call from rAF. */
  getLevel: () => number;
  /** Update digital gain live (no graph rebuild needed). */
  setGain: (gainLinear: number) => void;
};

/**
 * Build source → gain → destination for recording, plus an analyser tap for metering.
 * `gainLinear` is applied in the digital domain (0.25–2 typical); warn users about OS mic level too.
 */
export async function createMicAudioGraph(
  micStream: MediaStream,
  gainLinear: number
): Promise<MicAudioGraph | null> {
  try {
    const audioContext = new AudioContext();
    await audioContext.resume();

    const source = audioContext.createMediaStreamSource(micStream);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = gainLinear;

    const destination = audioContext.createMediaStreamDestination();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;

    const data = new Float32Array(analyser.fftSize);

    source.connect(gainNode);
    gainNode.connect(destination);
    gainNode.connect(analyser);

    return {
      recordingStream: destination.stream,
      dispose: () => {
        try {
          micStream.getTracks().forEach((t) => t.stop());
        } catch {
          /* ignore */
        }
        void audioContext.close();
      },
      getLevel: () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] ?? 0;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // Map typical speech RMS (~0.01–0.2) into a visible 0–1 range.
        return Math.min(1, rms * 4.5);
      },
      setGain: (g: number) => {
        gainNode.gain.value = Math.max(0, g);
      },
    };
  } catch {
    return null;
  }
}
