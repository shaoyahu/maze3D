import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJSON, saveJSON, isStorageAvailable, saveJSONDebounced, flushPendingWrites, DEBOUNCE_WRITE_MS } from '../../src/store/persist';

describe('persist', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isStorageAvailable returns true in happy-dom', () => {
    expect(isStorageAvailable()).toBe(true);
  });

  it('saveJSON then loadJSON round-trips an object', () => {
    saveJSON('k', { a: 1, b: 'x' });
    expect(loadJSON('k', { a: 0, b: '' })).toEqual({ a: 1, b: 'x' });
  });

  it('loadJSON returns fallback when key missing', () => {
    expect(loadJSON('nope', { a: 0 })).toEqual({ a: 0 });
  });

  it('loadJSON returns fallback on parse error', () => {
    localStorage.setItem('bad', '{not json');
    expect(loadJSON('bad', { fallback: true })).toEqual({ fallback: true });
  });

  it('saveJSON silently no-ops when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveJSON('k', { a: 1 })).not.toThrow();
    spy.mockRestore();
  });

  describe('with validator', () => {
    const isObject = (raw: unknown): raw is Record<string, unknown> =>
      typeof raw === 'object' && raw !== null && !Array.isArray(raw);

    it('returns parsed value when validator passes', () => {
      saveJSON('k', { a: 1 });
      expect(loadJSON('k', {} as Record<string, unknown>, isObject)).toEqual({ a: 1 });
    });

    it('returns fallback when validator rejects the shape', () => {
      localStorage.setItem('k', JSON.stringify('a string'));
      expect(loadJSON('k', { fallback: true } as Record<string, unknown>, isObject)).toEqual({
        fallback: true,
      });
    });

    it('returns fallback when stored value is null', () => {
      localStorage.setItem('k', JSON.stringify(null));
      expect(loadJSON('k', { fallback: true } as Record<string, unknown>, isObject)).toEqual({
        fallback: true,
      });
    });

    it('returns fallback when stored value is an array', () => {
      localStorage.setItem('k', JSON.stringify([1, 2, 3]));
      expect(loadJSON('k', { fallback: true } as Record<string, unknown>, isObject)).toEqual({
        fallback: true,
      });
    });
  });

  describe('Settings validator', () => {
    type Settings = { pointerSensitivity: number; darkMode: boolean };

    const isSettings = (raw: unknown): raw is Settings => {
      if (typeof raw !== 'object' || raw === null) return false;
      const s = raw as Record<string, unknown>;
      return (
        typeof s.pointerSensitivity === 'number' &&
        Number.isFinite(s.pointerSensitivity) &&
        typeof s.darkMode === 'boolean'
      );
    };

    it('loads a valid Settings object', () => {
      localStorage.setItem('s', JSON.stringify({ pointerSensitivity: 0.005, darkMode: true }));
      const result = loadJSON<Settings>(
        's',
        { pointerSensitivity: 0.002, darkMode: false },
        isSettings,
      );
      expect(result).toEqual({ pointerSensitivity: 0.005, darkMode: true });
    });

    it('falls back when pointerSensitivity is not a number', () => {
      localStorage.setItem('s', JSON.stringify({ pointerSensitivity: 'abc', darkMode: true }));
      const result = loadJSON<Settings>(
        's',
        { pointerSensitivity: 0.002, darkMode: false },
        isSettings,
      );
      expect(result).toEqual({ pointerSensitivity: 0.002, darkMode: false });
    });

    it('falls back when darkMode is not a boolean', () => {
      localStorage.setItem('s', JSON.stringify({ pointerSensitivity: 0.005, darkMode: 1 }));
      const result = loadJSON<Settings>(
        's',
        { pointerSensitivity: 0.002, darkMode: false },
        isSettings,
      );
      expect(result).toEqual({ pointerSensitivity: 0.002, darkMode: false });
    });

    it('falls back when stored value is null', () => {
      localStorage.setItem('s', JSON.stringify(null));
      const result = loadJSON<Settings>(
        's',
        { pointerSensitivity: 0.002, darkMode: false },
        isSettings,
      );
      expect(result).toEqual({ pointerSensitivity: 0.002, darkMode: false });
    });
  });

  describe('BestRecord map validator', () => {
    type BestRecord = {
      levelId: string;
      timeUsed: number;
      collected: number;
      total: number;
      date: string;
    };

    const isBestRecord = (raw: unknown): raw is BestRecord => {
      if (typeof raw !== 'object' || raw === null) return false;
      const r = raw as Record<string, unknown>;
      return (
        typeof r.levelId === 'string' &&
        typeof r.timeUsed === 'number' &&
        Number.isFinite(r.timeUsed) &&
        typeof r.collected === 'number' &&
        Number.isFinite(r.collected) &&
        typeof r.total === 'number' &&
        Number.isFinite(r.total) &&
        typeof r.date === 'string'
      );
    };

    const isBestRecordMap = (raw: unknown): raw is Record<string, BestRecord> => {
      if (typeof raw !== 'object' || raw === null) return false;
      for (const v of Object.values(raw)) {
        if (!isBestRecord(v)) return false;
      }
      return true;
    };

    const validRecord: BestRecord = {
      levelId: 'l1',
      timeUsed: 30,
      collected: 1,
      total: 2,
      date: '2026-06-06T00:00:00Z',
    };

    it('loads a valid bestByLevel map', () => {
      localStorage.setItem('m', JSON.stringify({ l1: validRecord }));
      const result = loadJSON<Record<string, BestRecord>>('m', {}, isBestRecordMap);
      expect(result).toEqual({ l1: validRecord });
    });

    it('falls back when bestByLevel is null', () => {
      localStorage.setItem('m', JSON.stringify(null));
      const result = loadJSON<Record<string, BestRecord>>('m', {}, isBestRecordMap);
      expect(result).toEqual({});
    });

    it('falls back when a value in the map is null', () => {
      localStorage.setItem('m', JSON.stringify({ l1: null }));
      const result = loadJSON<Record<string, BestRecord>>('m', {}, isBestRecordMap);
      expect(result).toEqual({});
    });

    it('falls back when a record has wrong field types', () => {
      localStorage.setItem('m', JSON.stringify({ l1: { ...validRecord, timeUsed: 'fast' } }));
      const result = loadJSON<Record<string, BestRecord>>('m', {}, isBestRecordMap);
      expect(result).toEqual({});
    });

    it('falls back when a record has a non-finite number', () => {
      localStorage.setItem('m', JSON.stringify({ l1: { ...validRecord, timeUsed: Infinity } }));
      const result = loadJSON<Record<string, BestRecord>>('m', {}, isBestRecordMap);
      expect(result).toEqual({});
    });

    it('falls back when a record is missing a required field', () => {
      const { levelId, ...incomplete } = validRecord;
      void levelId;
      localStorage.setItem('m', JSON.stringify({ l1: incomplete }));
      const result = loadJSON<Record<string, BestRecord>>('m', {}, isBestRecordMap);
      expect(result).toEqual({});
    });
  });

  // P2-11 (A-M7) — debounced writer for hot-path settings. A slider drag
  // can fire `set(...)` dozens of times per second; without debouncing,
  // each call JSON.stringify + localStorage.setItem synchronously. The
  // debounce coalesces N writes within DEBOUNCE_WRITE_MS into 1 write of
  // the latest value. The `flushPendingWrites(key?)` test seam lets tests
  // advance the debounce deterministically without relying on real timers
  // (a `vi.useFakeTimers` + `vi.advanceTimersByTime` path is also covered
  // so the timer mechanism itself is pinned, not just the seam).
  describe('A-M7 — saveJSONDebounced / flushPendingWrites', () => {
    const KEY_A = 'debounce.test.a';
    const KEY_B = 'debounce.test.b';

    beforeEach(() => {
      // Each test starts with no pending writes; leftover timers from a
      // previous test would silently fire during the next assertion and
      // pollute localStorage. The seam makes the cleanup explicit.
      flushPendingWrites();
      localStorage.clear();
    });

    it('exposes DEBOUNCE_WRITE_MS = 250 so the cadence is part of the contract', () => {
      // The constant is exported so a regression that widens the window
      // (e.g. 1000ms) shows up in the type signature of the import, not
      // buried in a magic number. The value matches the A-M7
      // recommendation: long enough to coalesce a slider drag's
      // intermediate values, short enough that a delayed flush is
      // imperceptible to the user.
      expect(DEBOUNCE_WRITE_MS).toBe(250);
    });

    it('does not write synchronously — localStorage stays empty after the call', () => {
      // The whole point: the hot path (settings setters) is decoupled
      // from the disk write. If saveJSONDebounced wrote synchronously
      // this test would fail and the A-M7 fix would be a no-op.
      saveJSONDebounced(KEY_A, { x: 1 });
      expect(localStorage.getItem(KEY_A)).toBeNull();
    });

    it('flushPendingWrites(key) writes the latest value and clears the pending entry', () => {
      saveJSONDebounced(KEY_A, { x: 1 });
      flushPendingWrites(KEY_A);
      expect(JSON.parse(localStorage.getItem(KEY_A)!)).toEqual({ x: 1 });
      // A second flush on the same key is a no-op (the pending entry
      // was removed by the first flush, not just the timer cleared).
      localStorage.removeItem(KEY_A);
      flushPendingWrites(KEY_A);
      expect(localStorage.getItem(KEY_A)).toBeNull();
    });

    it('coalesces N writes within the window into 1 write of the latest value', () => {
      // The realistic A-M7 case: a slider drag fires set('pointerSensitivity', 0.002)
      // then set(..., 0.003) then set(..., 0.004) within ~100ms. The
      // debounce must keep only the latest value and call setItem once.
      saveJSONDebounced(KEY_A, { v: 1 });
      saveJSONDebounced(KEY_A, { v: 2 });
      saveJSONDebounced(KEY_A, { v: 3 });
      flushPendingWrites(KEY_A);
      // Only the latest value lands in localStorage.
      expect(JSON.parse(localStorage.getItem(KEY_A)!)).toEqual({ v: 3 });
    });

    it('is per-key — a pending write on key B is not flushed when key A is flushed', () => {
      // Each key has its own timer; flushing one must not touch the
      // other's pending entry. A regression that used a single shared
      // timer (or a single payload object) would fail this.
      saveJSONDebounced(KEY_A, { v: 'A' });
      saveJSONDebounced(KEY_B, { v: 'B' });
      flushPendingWrites(KEY_A);
      expect(localStorage.getItem(KEY_A)).toBeTruthy();
      expect(localStorage.getItem(KEY_B)).toBeNull();
      flushPendingWrites(KEY_B);
      expect(localStorage.getItem(KEY_B)).toBeTruthy();
    });

    it('flushPendingWrites() with no arg flushes every pending key', () => {
      saveJSONDebounced(KEY_A, { v: 'A' });
      saveJSONDebounced(KEY_B, { v: 'B' });
      flushPendingWrites();
      expect(localStorage.getItem(KEY_A)).toBeTruthy();
      expect(localStorage.getItem(KEY_B)).toBeTruthy();
    });

    it('flushPendingWrites(unknownKey) is a no-op', () => {
      // The seam must be safe to call speculatively (e.g. from a useEffect
      // cleanup that doesn't know whether a write is pending). Pinning
      // this prevents a future refactor from introducing a `delete on
      // missing key` exception path.
      saveJSONDebounced(KEY_A, { v: 1 });
      expect(() => flushPendingWrites('does.not.exist')).not.toThrow();
      // KEY_A's pending write is still intact.
      expect(localStorage.getItem(KEY_A)).toBeNull();
      flushPendingWrites(KEY_A);
      expect(localStorage.getItem(KEY_A)).toBeTruthy();
    });

    it('the timer mechanism (not just the test seam) fires after DEBOUNCE_WRITE_MS', () => {
      // The seam is a convenience for tests; the production code path
      // is the setTimeout. Fake timers + advance proves the timer
      // actually fires the debounced write on its own.
      vi.useFakeTimers();
      try {
        saveJSONDebounced(KEY_A, { v: 'late' });
        expect(localStorage.getItem(KEY_A)).toBeNull();
        vi.advanceTimersByTime(DEBOUNCE_WRITE_MS - 1);
        expect(localStorage.getItem(KEY_A)).toBeNull();
        vi.advanceTimersByTime(1);
        expect(JSON.parse(localStorage.getItem(KEY_A)!)).toEqual({ v: 'late' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('re-arming within the window resets the timer (the drag-while-debouncing case)', () => {
      // If the user releases the slider and re-grabs it before the
      // debounce fires, the timer must extend — otherwise the first
      // release's value would land on disk before the second grab's
      // intermediate values. The implementation does this by
      // clearTimeout on the existing entry when a new write arrives.
      vi.useFakeTimers();
      try {
        saveJSONDebounced(KEY_A, { v: 1 });
        vi.advanceTimersByTime(200);
        saveJSONDebounced(KEY_A, { v: 2 });
        vi.advanceTimersByTime(200);
        // 400ms total since the first call, but the timer was reset at
        // 200ms so nothing should be written yet.
        expect(localStorage.getItem(KEY_A)).toBeNull();
        vi.advanceTimersByTime(50);
        // Now 250ms since the second call → the timer fires.
        expect(JSON.parse(localStorage.getItem(KEY_A)!)).toEqual({ v: 2 });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
