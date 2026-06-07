import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJSON, saveJSON, isStorageAvailable } from '../../src/store/persist';

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
});
