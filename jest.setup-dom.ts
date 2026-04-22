/**
 * Loaded by the jsdom Jest project (see `jest.config.ts`) after each test
 * file mounts. Wires up `@testing-library/jest-dom` matchers so component
 * tests can use `expect(el).toBeInTheDocument()` etc.
 *
 * Keep this file SMALL — anything heavier (per-test mock setup, fake
 * MediaRecorder factories) belongs in the test file or a co-located
 * `__mocks__/` helper, so failures point at the right place.
 */

import "@testing-library/jest-dom";
