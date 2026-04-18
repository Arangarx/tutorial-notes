# Regression tests — do not delete without reading this

Every file in this folder guards a real bug that hit a pilot user and caused visible breakage. Before deleting or weakening any test, find the original bug in `git log` and confirm the issue can't recur.

## Index

| File | Bug it guards | Commit that introduced it |
|---|---|---|
| `globals-css.test.ts` | Dark-mode CSS vars missing (`--color-muted` etc.) made recording card text invisible against the dark background. Global `input { width: 100% }` rule stretched checkboxes and pushed label text off-screen. | `5de4e0d` |
| `csp-headers.test.ts` | Missing `media-src 'self' blob:` in CSP caused Chrome to block `<audio>` preview with "MEDIA_ELEMENT_ERROR: Media Load rejected by URL safety check". The error code was `4` (SRC_NOT_SUPPORTED) even though the blob was valid. | `96037b7` |
| `audio-mime-priority.test.ts` | `audio/mp4` listed first in `chooseMimeType()` caused desktop Chrome to produce MP4 with malformed container metadata — Whisper could transcribe it but `<audio>` couldn't play it. iOS Safari still needs MP4 as a fallback (it doesn't support WebM in MediaRecorder). Also guards the no-timeslice `recorder.start()` call that prevents iOS Safari from producing fragmented MP4. | `5402547` |
| `transcribe-result-shape.test.ts` | `transcribeAndGenerateAction` silently returned `ok: true` with empty fields when Whisper produced no transcript or AI generation failed, showing "Form filled" when nothing was filled. | `5de4e0d` |

## Adding a new regression test

1. Name it `<descriptive-slug>.test.ts` and put it in this folder.
2. Add a row to the index above with: file name, one-sentence description of the bug, and the commit hash that introduced the fix.
3. Keep the test as a **unit test** (import the pure function or read the static file directly) if possible. Don't reach for a full Playwright integration test unless the bug requires browser behaviour to reproduce.
