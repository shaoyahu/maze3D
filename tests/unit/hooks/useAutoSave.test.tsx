import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useAutoSave, DEFAULT_AUTOSAVE_INTERVAL_MS } from '../../../src/hooks/useAutoSave';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';

function resetEditor(): void {
  localStorage.clear();
  useLevelStore.setState({ customLevels: {} });
  useEditorStore.setState({
    level: {
      id: 'custom-autosave-test',
      name: 'AutoSave Test',
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
      traps: [],
      doors: [],
      rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
    },
    tool: 'select',
    selection: null,
    camera: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    dirty: false,
    lastSavedAt: null,
    lastError: null,
    lastSavedHash: null,
  });
}

// Tiny harness so the hook runs inside a real component lifecycle
// (useEffect / setInterval require a render context).
function Harness({
  intervalMs,
  onAutoSaved,
  onAutoSaveError,
}: {
  intervalMs?: number;
  onAutoSaved?: (ts: number) => void;
  onAutoSaveError?: (msg: string) => void;
}) {
  useAutoSave({ intervalMs, onAutoSaved, onAutoSaveError });
  return null;
}

describe('useAutoSave (F-2026-06-12-F1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEditor();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes a 30s default interval', () => {
    // Pin the default so a UX-driven change is forced to update tests.
    expect(DEFAULT_AUTOSAVE_INTERVAL_MS).toBe(30_000);
  });

  it('does NOT fire onAutoSaved when the level is not dirty', () => {
    const onAutoSaved = vi.fn();
    render(<Harness onAutoSaved={onAutoSaved} />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onAutoSaved).not.toHaveBeenCalled();
  });

  it('fires onAutoSaved once after the default 30s interval when dirty', () => {
    const onAutoSaved = vi.fn();
    render(<Harness onAutoSaved={onAutoSaved} />);
    act(() => {
      useEditorStore.getState().placeWall(1, 0);
    });
    expect(useEditorStore.getState().dirty).toBe(true);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onAutoSaved).toHaveBeenCalledTimes(1);
  });

  it('respects a custom interval (5s)', () => {
    const onAutoSaved = vi.fn();
    render(<Harness intervalMs={5_000} onAutoSaved={onAutoSaved} />);
    act(() => {
      useEditorStore.getState().placeWall(1, 0);
    });
    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(onAutoSaved).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onAutoSaved).toHaveBeenCalledTimes(1);
  });

  it('passes the wall-clock timestamp to onAutoSaved', () => {
    const onAutoSaved = vi.fn();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    render(<Harness onAutoSaved={onAutoSaved} />);
    act(() => {
      useEditorStore.getState().placeWall(1, 0);
    });
    act(() => {
      // `vi.advanceTimersByTime` also moves the fake system clock
      // forward, so by the time the interval callback fires and calls
      // `Date.now()`, the clock has advanced by exactly 30s.
      vi.advanceTimersByTime(30_000);
    });
    expect(onAutoSaved).toHaveBeenCalledWith(now + 30_000);
  });

  it('clears dirty after a successful auto-save (lastSavedHash advances)', () => {
    const onAutoSaved = vi.fn();
    render(<Harness onAutoSaved={onAutoSaved} />);
    act(() => {
      useEditorStore.getState().placeWall(1, 0);
    });
    expect(useEditorStore.getState().dirty).toBe(true);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  it('fires onAutoSaveError with the validator message when saveLevel fails', () => {
    const onAutoSaved = vi.fn();
    const onAutoSaveError = vi.fn();
    // Build an invalid level: start (0,0) is on a wall, so validateMaze
    // throws "start is on a wall" and saveLevel returns { ok: false }.
    useEditorStore.setState({
      level: {
        id: 'custom-invalid-autosave',
        name: 'Invalid',
        size: { width: 5, depth: 4 },
        cellSize: 2,
        start: { x: 0, z: 0 },
        exit: { x: 4, z: 3 },
        walls: [
          [1, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
        pickups: [],
        enemies: [],
        traps: [],
        doors: [],
        rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
      },
      dirty: true,
    });
    render(<Harness onAutoSaved={onAutoSaved} onAutoSaveError={onAutoSaveError} />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onAutoSaveError).toHaveBeenCalledTimes(1);
    expect(onAutoSaveError).toHaveBeenCalledWith(expect.stringMatching(/start is on a wall/));
    expect(onAutoSaved).not.toHaveBeenCalled();
  });

  it('clears the interval on unmount (no callback after unmount)', () => {
    const onAutoSaved = vi.fn();
    const { unmount } = render(<Harness onAutoSaved={onAutoSaved} />);
    act(() => {
      useEditorStore.getState().placeWall(1, 0);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onAutoSaved).not.toHaveBeenCalled();
  });

  it('re-ticks after a fresh edit (interval keeps running across saves)', () => {
    const onAutoSaved = vi.fn();
    render(<Harness onAutoSaved={onAutoSaved} />);
    act(() => {
      useEditorStore.getState().placeWall(1, 0);
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onAutoSaved).toHaveBeenCalledTimes(1);
    // dirty is now false; no new save until the next edit.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onAutoSaved).toHaveBeenCalledTimes(1);
    // Edit again → dirty=true → next tick fires.
    act(() => {
      useEditorStore.getState().placeWall(2, 0);
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onAutoSaved).toHaveBeenCalledTimes(2);
  });
});
