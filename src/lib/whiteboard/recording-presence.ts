/**
 * Derive recording state from the tutor's intent + student presence.
 *
 * Sarah (Apr 2026 pilot feedback): "I don't think the recording needs
 * to keep going if the student isn't connected. And it should pop up
 * with a message saying student has disconnected ... and recording
 * has paused. That way I know when it happens I can pause my
 * instruction."
 *
 * The contract this function encodes:
 *
 *   - `userWantsRecording` is the tutor's button-press intent. Manual
 *     pause clears it; manual start sets it.
 *   - `bothPresent` is the live overlap signal (tutor socket up AND
 *     student peer in the room). The workspace computes this from
 *     `sync-client.peerCount`.
 *   - `recordingActive` (the value passed to the recorder hook + audio
 *     gate) is `userWantsRecording && bothPresent`. So when the
 *     student drops, the recorder sees the same `recordingActive=false`
 *     transition it would see for a manual pause — it flushes the
 *     pending diff and emits a `pause` event for replay. When the
 *     student returns, recording auto-resumes (the recorder hook also
 *     handles that transition and emits `resume`).
 *   - `autoPaused` distinguishes the auto-pause case from the manual
 *     pause case so the UI can render the right banner / pill copy.
 *     (`autoPaused === true` → tutor wanted to record but student is
 *     missing.)
 *   - `awaitingStart` covers the "tutor pressed Start before student
 *     joined" sub-case: same auto-pause state, but the right banner
 *     copy is "we'll start recording when the student joins" rather
 *     than "recording paused — student dropped".
 *
 * Tutor-solo mode (no live-sync URL configured) bypasses the gate
 * entirely — `bothPresent` is irrelevant when there's no student
 * link, and the tutor should be able to record review notes solo.
 */

export type RecordingPresenceInputs = {
  /** Tutor's button-press intent (set by Start, cleared by Pause). */
  userWantsRecording: boolean;
  /** True when tutor socket is up AND a student peer is in the room. */
  bothPresent: boolean;
  /**
   * Whether live-sync is configured at all. False = tutor-solo mode
   * (no `WHITEBOARD_SYNC_URL`); recording behaves as a normal solo
   * recorder with no presence gating.
   */
  syncEnabled: boolean;
};

export type RecordingPresenceState = {
  /** Final value to pass to the recorder hook + audio gate. */
  recordingActive: boolean;
  /**
   * Tutor wants to record but the student isn't here. Drives the
   * auto-pause banner. False during a normal manual pause.
   */
  autoPaused: boolean;
  /**
   * Sub-case of `autoPaused`: tutor pressed Start before any student
   * has ever connected this session. Lets the UI say "we'll start
   * recording when the student joins" instead of "student dropped".
   *
   * The caller passes this through `everBothPresent` so the helper
   * stays pure — the workspace tracks the latch with a ref.
   */
  awaitingStart: boolean;
  /** UI banner copy. Empty string when no banner should render. */
  bannerMessage: string;
  /** UI pill copy for the recording status pill. */
  pillLabel: string;
  /** UI pill colour. */
  pillColor: "red" | "amber" | "grey";
};

export type RecordingPresenceContext = RecordingPresenceInputs & {
  /**
   * Has the room ever been both-present this session? Used to choose
   * "starting…" vs "paused (student dropped)" copy. The workspace
   * latches this via a ref so a temporary disconnect doesn't revert
   * the copy back to the pre-start phrasing.
   */
  everBothPresent: boolean;
};

export function deriveRecordingPresence(
  ctx: RecordingPresenceContext
): RecordingPresenceState {
  const { userWantsRecording, bothPresent, syncEnabled, everBothPresent } = ctx;

  // Tutor-solo mode: no presence gating. `recordingActive` mirrors
  // `userWantsRecording` exactly. The banner never shows because
  // there's no student to be missing.
  if (!syncEnabled) {
    return {
      recordingActive: userWantsRecording,
      autoPaused: false,
      awaitingStart: false,
      bannerMessage: "",
      pillLabel: userWantsRecording ? "Recording" : "Paused",
      pillColor: userWantsRecording ? "red" : "grey",
    };
  }

  // Live-sync mode.
  const recordingActive = userWantsRecording && bothPresent;
  const autoPaused = userWantsRecording && !bothPresent;
  const awaitingStart = autoPaused && !everBothPresent;

  if (recordingActive) {
    return {
      recordingActive: true,
      autoPaused: false,
      awaitingStart: false,
      bannerMessage: "",
      pillLabel: "Recording",
      pillColor: "red",
    };
  }

  if (autoPaused) {
    if (awaitingStart) {
      return {
        recordingActive: false,
        autoPaused: true,
        awaitingStart: true,
        bannerMessage:
          "Waiting for your student to join — recording will start automatically once they connect.",
        pillLabel: "Waiting for student",
        pillColor: "amber",
      };
    }
    return {
      recordingActive: false,
      autoPaused: true,
      awaitingStart: false,
      bannerMessage:
        "Student disconnected — recording paused. We'll resume automatically when they reconnect.",
      pillLabel: "Auto-paused (student offline)",
      pillColor: "amber",
    };
  }

  // Manual pause (or never-started): no banner.
  return {
    recordingActive: false,
    autoPaused: false,
    awaitingStart: false,
    bannerMessage: "",
    pillLabel: "Paused",
    pillColor: "grey",
  };
}
