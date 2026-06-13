import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useAutoSave } from '../../../src/hooks/useAutoSave';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';
import type { MazeData } from '../../../src/maze/types';

// ---------------------------------------------------------------------------
// F-B-ui-M-5: exponential backoff after consecutive auto-save failures.
//
// Background: useAutoSave ticks every 30s. When the editor enters a
// structurally invalid state (e.g. start on a wall), saveLevel() returns
// { ok: false } and the hook fires onAutoSaveError. Without backoff the
// toolbar shows "自动保存失败: ..." every 30s indefinitely — pure noise,
// because the user already sees the error from the first tick.
//
// Fix: track consecutive failures. After each failure, skip ticks until
// the next attempt window passes. Schedule (capped at 5 min):
//   - failures=1 → next attempt 60s after the failed save  (skip 1 tick)
//   - failures=2 → next attempt 120s after the failed save (skip 3 ticks)
//   - failures=3+ → next attempt 300s after the failed save (skip 9 ticks)
//
// Reset rules:
//   - successful save → failure count back to 0, next attempt at base 30s
//   - dirty toggles false (user reverted) → reset
// ---------------------------------------------------------------------------

function validLevel(): MazeData {
  return {
    id: 'custom-valid',
    name: 'Valid',
    size: { width: 5, depth: 4 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 4, z: 3 },
    walls: [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ],
    pickups: [],
    enemies: [],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
  };
}

function invalidLevel(): MazeData {
  // Start sits on a wall → validateMaze throws → saveLevel returns ok=false.
  const lv = validLevel();
  lv.walls[0][0] = 1;
  return lv;
}

function setEditorLevel(level: MazeData, dirty: boolean): void {
  useEditorStore.setState({
    level,
    tool: 'select',
    selection: null,
    camera: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    dirty,
    lastSavedAt: null,
    lastError: null,
    lastSavedHash: null,
  });
}

function Harness({
  onAutoSaved,
  onAutoSaveError,
}: {
  onAutoSaved?: (ts: number) => void;
  onAutoSaveError?: (msg: string) => void;
}) {
  useAutoSave({ onAutoSaved, onAutoSaveError });
  return null;
}

describe('useAutoSave backoff after consecutive failures (F-B-ui-M-5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    localStorage.clear();
    useLevelStore.setState({ customLevels: {} });
    setEditorLevel(invalidLevel(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('first failure does not throttle: error fires on the first 30s tick', () => {
    const onError = vi.fn();
    render(<Harness onAutoSaveError={onError} />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('after first failure, next 30s tick is skipped (backoff = 60s)', () => {
    const onError = vi.fn();
    render(<Harness onAutoSaveError={onError} />);

    // t=30s: fail #1, schedule next attempt for t=90s (failure + 60s)
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(1);

    // t=60s: in backoff window, silent skip
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(1);

    // t=90s: backoff window passed → fail #2
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('backoff grows: failure 2 waits 120s, failure 3 waits 300s (cap)', () => {
    const onError = vi.fn();
    render(<Harness onAutoSaveError={onError} />);

    // Failure 1 at t=30s, next at t=90s
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(1);

    // Failure 2 at t=90s, next at t=90+120=210s
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onError).toHaveBeenCalledTimes(2);

    // Ticks at 120/150/180s all skipped; failure 3 at t=210s
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(onError).toHaveBeenCalledTimes(3);

    // Backoff now caps at 300s: next attempt at t=510s
    // Ticks at 240..510s skipped, then fire at t=510s
    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(onError).toHaveBeenCalledTimes(4);

    // Backoff stays at 300s for subsequent failures
    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(onError).toHaveBeenCalledTimes(5);
  });

  it('successful save resets the backoff so the next failure waits only 60s', () => {
    const onError = vi.fn();
    const onSaved = vi.fn();
    render(<Harness onAutoSaveError={onError} onAutoSaved={onSaved} />);

    // Failure 1 at t=30s, next at t=90s
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(1);

    // User fixes the level. dirty stays true so the next attempt saves.
    act(() => {
      setEditorLevel(validLevel(), true);
    });

    // t=60s is still in backoff → skipped
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);

    // t=90s → save succeeds, backoff resets
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    // User breaks the level again and marks dirty
    act(() => {
      setEditorLevel(invalidLevel(), true);
    });

    // t=120s → first failure of the new run, no skip
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(2);

    // t=150s → in backoff (60s after t=120s failure)
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(2);

    // t=180s → backoff window passed, fail again
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it('reverting to clean state (dirty=false) resets the backoff', () => {
    const onError = vi.fn();
    render(<Harness onAutoSaveError={onError} />);

    // Failure 1 at t=30s, schedule next at t=90s
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(1);

    // User reverts everything → dirty=false
    act(() => {
      useEditorStore.setState({ dirty: false });
    });

    // t=60s: dirty=false → no-op, and backoff resets so a fresh
    // failure on the next dirty cycle fires immediately.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(1);

    // User makes a new edit that's also invalid → dirty=true
    act(() => {
      useEditorStore.setState({ dirty: true });
    });

    // t=90s: first failure of the new run — must NOT be in backoff window
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
