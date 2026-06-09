import { describe, it, expect, beforeEach } from 'vitest';
import { useLevelStore, isBestRecord, sanitizeBestRecordMap } from '../../src/store/levelStore';
import type { BestRecord } from '../../src/store/levelStore';

function rec(over: Partial<BestRecord> = {}): BestRecord {
  return {
    levelId: 'l1', timeUsed: 30, collected: 1, total: 2, date: '2026-06-06T00:00:00Z',
    ...over,
  };
}

const PROC_SEED = {
  algorithm: 'recursive-backtracker' as const,
  size: 15 as const,
  mazeSeed: '0123456789abcdef',
};

describe('levelStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useLevelStore.setState({ bestByLevel: {} });
  });

  it('getBest returns undefined when no record exists', () => {
    expect(useLevelStore.getState().getBest('missing')).toBeUndefined();
  });

  it('record stores the first record for a level', () => {
    useLevelStore.getState().record(rec());
    expect(useLevelStore.getState().getBest('l1')).toEqual(rec());
  });

  it('record replaces a record with a faster time', () => {
    useLevelStore.getState().record(rec({ timeUsed: 50, collected: 1 }));
    useLevelStore.getState().record(rec({ timeUsed: 30, collected: 1 }));
    expect(useLevelStore.getState().getBest('l1')?.timeUsed).toBe(30);
  });

  it('record keeps the current record when new one is slower', () => {
    useLevelStore.getState().record(rec({ timeUsed: 20, collected: 1 }));
    useLevelStore.getState().record(rec({ timeUsed: 50, collected: 1 }));
    expect(useLevelStore.getState().getBest('l1')?.timeUsed).toBe(20);
  });

  it('record breaks ties by more collected pickups', () => {
    useLevelStore.getState().record(rec({ timeUsed: 30, collected: 1 }));
    useLevelStore.getState().record(rec({ timeUsed: 30, collected: 2 }));
    expect(useLevelStore.getState().getBest('l1')?.collected).toBe(2);
  });

  it('isBestRecord accepts a valid record', () => {
    expect(isBestRecord(rec())).toBe(true);
  });

  it('isBestRecord rejects negative timeUsed', () => {
    expect(isBestRecord(rec({ timeUsed: -1 }))).toBe(false);
  });

  it('isBestRecord rejects negative collected or total', () => {
    expect(isBestRecord(rec({ collected: -1 }))).toBe(false);
    expect(isBestRecord(rec({ total: -1 }))).toBe(false);
  });

  it('isBestRecord rejects collected > total', () => {
    expect(isBestRecord(rec({ collected: 3, total: 2 }))).toBe(false);
  });

  it('isBestRecord rejects non-ISO or empty date', () => {
    expect(isBestRecord(rec({ date: 'not a date' }))).toBe(false);
    expect(isBestRecord(rec({ date: '' }))).toBe(false);
  });

  it('isBestRecord rejects NaN/Infinity numerics', () => {
    expect(isBestRecord(rec({ timeUsed: NaN }))).toBe(false);
    expect(isBestRecord(rec({ timeUsed: Infinity }))).toBe(false);
  });

  it('isBestRecord rejects empty levelId', () => {
    expect(isBestRecord(rec({ levelId: '' }))).toBe(false);
  });

  describe('seed field (P2-3 procedural mode)', () => {
    it('accepts a record with a valid procedural seed', () => {
      expect(isBestRecord(rec({ levelId: 'algo-v1-recursive-backtracker-15-0123456789abcdef', seed: PROC_SEED }))).toBe(true);
    });

    it('accepts a record without a seed (hand-crafted level)', () => {
      expect(isBestRecord(rec())).toBe(true);
    });

    it('rejects a record with an unknown algorithm in the seed', () => {
      expect(isBestRecord(rec({ seed: { ...PROC_SEED, algorithm: 'not-a-real-algo' as 'recursive-backtracker' } }))).toBe(false);
    });

    it('rejects a record with a non-whitelisted size in the seed', () => {
      expect(isBestRecord(rec({ seed: { ...PROC_SEED, size: 99 as 15 } }))).toBe(false);
    });

    it('rejects a record with a malformed mazeSeed in the seed', () => {
      expect(isBestRecord(rec({ seed: { ...PROC_SEED, mazeSeed: 'not-hex' } }))).toBe(false);
    });

    it('rejects a record where the seed object is missing required fields', () => {
      expect(isBestRecord(rec({ seed: { algorithm: 'prim', size: 15 } as unknown as BestRecord['seed'] }))).toBe(false);
    });

    it('record() stores the seed field for procedural bests', () => {
      useLevelStore.getState().record(rec({ levelId: 'algo-v1-prim-30-aaaaaaaaaaaaaaaa', seed: { ...PROC_SEED, algorithm: 'prim', size: 30, mazeSeed: 'aaaaaaaaaaaaaaaa' } }));
      const stored = useLevelStore.getState().getBest('algo-v1-prim-30-aaaaaaaaaaaaaaaa');
      expect(stored?.seed).toEqual({ algorithm: 'prim', size: 30, mazeSeed: 'aaaaaaaaaaaaaaaa' });
    });

    it('sanitizeBestRecordMap drops records whose seed field is invalid', () => {
      const good = rec({ levelId: 'good', seed: PROC_SEED });
      const bad = rec({ levelId: 'bad', seed: { ...PROC_SEED, mazeSeed: 'not-hex' } });
      expect(sanitizeBestRecordMap({ good, bad })).toEqual({ good });
    });
  });

  describe('sanitizeBestRecordMap', () => {
    it('returns empty object for non-object input', () => {
      expect(sanitizeBestRecordMap(null)).toEqual({});
      expect(sanitizeBestRecordMap('bad')).toEqual({});
    });

    it('keeps valid records and drops invalid ones', () => {
      const good = rec({ levelId: 'good' });
      const bad = rec({ levelId: 'bad', timeUsed: -1 });
      const input = { good, bad };
      expect(sanitizeBestRecordMap(input)).toEqual({ good });
    });

    it('keeps all records when all are valid', () => {
      const a = rec({ levelId: 'a' });
      const b = rec({ levelId: 'b' });
      expect(sanitizeBestRecordMap({ a, b })).toEqual({ a, b });
    });
  });
});
