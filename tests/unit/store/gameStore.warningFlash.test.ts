// P3-3: gameStore warning flash surface. The store mirrors
// Game.startWarningFlash via the bridge's `onWarningFlashState`
// callback. The component layer (WarningFlashOverlay) reads
// `warningFlashUntil` (wall-clock-second timestamp) and
// `warningFlashTriggerId` (monotonic counter) to render the
// 0.5s red vignette.
//
// Contract pinned here:
//   1. `warningFlashUntil` initial value is 0 (not flashing).
//   2. `setWarningFlashUntil(until)` writes the value verbatim —
//      the bridge does the `Date.now()/1000 + 0.5` arithmetic,
//      the store is just a mirror.
//   3. `bumpWarningFlashTriggerId` increments the counter. The
//      overlay uses the counter as a React `key` to re-mount
//      the element, restarting the CSS animation when a new
//      warning lands inside the previous overlay's window.

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../../src/store/gameStore';

beforeEach(() => {
  // Reset to a clean state between cases so a previous
  // `setWarningFlashUntil` doesn't bleed into the next.
  useGameStore.setState({ warningFlashUntil: 0, warningFlashTriggerId: 0 });
});

describe('gameStore warning flash (P3-3)', () => {
  it('initial warningFlashUntil is 0 (no active warning)', () => {
    expect(useGameStore.getState().warningFlashUntil).toBe(0);
  });

  it('initial warningFlashTriggerId is 0 (first warning is the first trigger)', () => {
    expect(useGameStore.getState().warningFlashTriggerId).toBe(0);
  });

  it('setWarningFlashUntil stores the wall-clock timestamp verbatim', () => {
    const future = Date.now() / 1000 + 0.5;
    useGameStore.getState().setWarningFlashUntil(future);
    expect(useGameStore.getState().warningFlashUntil).toBe(future);
  });

  it('bumpWarningFlashTriggerId increments the counter by exactly 1', () => {
    const before = useGameStore.getState().warningFlashTriggerId;
    useGameStore.getState().bumpWarningFlashTriggerId();
    const after = useGameStore.getState().warningFlashTriggerId;
    expect(after).toBe(before + 1);
  });

  it('multiple bumps stack (a second warning inside the first overlay re-mounts)', () => {
    useGameStore.getState().bumpWarningFlashTriggerId();
    useGameStore.getState().bumpWarningFlashTriggerId();
    useGameStore.getState().bumpWarningFlashTriggerId();
    expect(useGameStore.getState().warningFlashTriggerId).toBe(3);
  });
});
