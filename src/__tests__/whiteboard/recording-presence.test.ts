/**
 * Pure-function tests for the recording presence gate.
 *
 * Sarah's pilot ask (Apr 2026): "I don't think the recording needs to
 * keep going if the student isn't connected. And it should pop up
 * with a message saying student has disconnected ... and recording
 * has paused."
 *
 * These tests pin the contract that the workspace client relies on
 * — a regression in the AND gate or the banner-copy switch would
 * silently re-introduce "billed Sarah for 30 minutes after the
 * student dropped".
 */

import { deriveRecordingPresence } from "@/lib/whiteboard/recording-presence";

describe("deriveRecordingPresence", () => {
  describe("tutor-solo mode (syncEnabled=false)", () => {
    it("recording mirrors userWantsRecording exactly", () => {
      const onCase = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: false,
        syncEnabled: false,
        everBothPresent: false,
      });
      expect(onCase.recordingActive).toBe(true);
      expect(onCase.autoPaused).toBe(false);
      expect(onCase.bannerMessage).toBe("");
      expect(onCase.pillLabel).toBe("Recording");
      expect(onCase.pillColor).toBe("red");

      const offCase = deriveRecordingPresence({
        userWantsRecording: false,
        bothPresent: false,
        syncEnabled: false,
        everBothPresent: false,
      });
      expect(offCase.recordingActive).toBe(false);
      expect(offCase.bannerMessage).toBe("");
      expect(offCase.pillLabel).toBe("Paused");
      expect(offCase.pillColor).toBe("grey");
    });

    it("never shows the auto-pause banner even if bothPresent flips", () => {
      // bothPresent is meaningless in solo mode but make sure we
      // don't accidentally render the banner if it leaks through.
      const r = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: true,
        syncEnabled: false,
        everBothPresent: true,
      });
      expect(r.bannerMessage).toBe("");
      expect(r.autoPaused).toBe(false);
    });
  });

  describe("live-sync mode (syncEnabled=true)", () => {
    it("manual pause: !userWants, !bothPresent → grey 'Paused', no banner", () => {
      const r = deriveRecordingPresence({
        userWantsRecording: false,
        bothPresent: false,
        syncEnabled: true,
        everBothPresent: false,
      });
      expect(r.recordingActive).toBe(false);
      expect(r.autoPaused).toBe(false);
      expect(r.awaitingStart).toBe(false);
      expect(r.bannerMessage).toBe("");
      expect(r.pillLabel).toBe("Paused");
      expect(r.pillColor).toBe("grey");
    });

    it("manual pause while student present: still no banner (tutor chose to pause)", () => {
      const r = deriveRecordingPresence({
        userWantsRecording: false,
        bothPresent: true,
        syncEnabled: true,
        everBothPresent: true,
      });
      expect(r.recordingActive).toBe(false);
      expect(r.autoPaused).toBe(false);
      expect(r.bannerMessage).toBe("");
    });

    it("active recording: userWants + bothPresent → red 'Recording', no banner", () => {
      const r = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: true,
        syncEnabled: true,
        everBothPresent: true,
      });
      expect(r.recordingActive).toBe(true);
      expect(r.autoPaused).toBe(false);
      expect(r.bannerMessage).toBe("");
      expect(r.pillLabel).toBe("Recording");
      expect(r.pillColor).toBe("red");
    });

    it("Start before student joined: amber 'Waiting for student' + 'will start' banner", () => {
      const r = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: false,
        syncEnabled: true,
        everBothPresent: false,
      });
      expect(r.recordingActive).toBe(false);
      expect(r.autoPaused).toBe(true);
      expect(r.awaitingStart).toBe(true);
      expect(r.pillColor).toBe("amber");
      expect(r.pillLabel).toBe("Waiting for student");
      expect(r.bannerMessage).toMatch(/start automatically/i);
      expect(r.bannerMessage).toMatch(/student to join/i);
    });

    it("student dropped after meeting: amber 'Auto-paused' + 'we'll resume' banner", () => {
      const r = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: false,
        syncEnabled: true,
        everBothPresent: true,
      });
      expect(r.recordingActive).toBe(false);
      expect(r.autoPaused).toBe(true);
      expect(r.awaitingStart).toBe(false);
      expect(r.pillColor).toBe("amber");
      expect(r.pillLabel).toMatch(/Auto-paused/);
      expect(r.bannerMessage).toMatch(/Student disconnected/i);
      expect(r.bannerMessage).toMatch(/resume automatically/i);
    });

    it("flipping bothPresent true→false→true with userWantsRecording held: recordingActive tracks AND gate", () => {
      // This is the regression scenario Sarah described — the recorder
      // must follow the gate, not the user's button intent alone.
      const both = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: true,
        syncEnabled: true,
        everBothPresent: true,
      });
      const dropped = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: false,
        syncEnabled: true,
        everBothPresent: true,
      });
      const back = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: true,
        syncEnabled: true,
        everBothPresent: true,
      });
      expect(both.recordingActive).toBe(true);
      expect(dropped.recordingActive).toBe(false);
      expect(back.recordingActive).toBe(true);
    });

    it("banner copy differs based on everBothPresent latch", () => {
      const firstStart = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: false,
        syncEnabled: true,
        everBothPresent: false,
      });
      const afterDrop = deriveRecordingPresence({
        userWantsRecording: true,
        bothPresent: false,
        syncEnabled: true,
        everBothPresent: true,
      });
      // The two cases need DIFFERENT banner copy — otherwise tutors
      // get "we'll start when they join" after a mid-session drop,
      // which is misleading.
      expect(firstStart.bannerMessage).not.toBe(afterDrop.bannerMessage);
    });
  });
});
