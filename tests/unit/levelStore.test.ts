import { describe, it, expect, beforeEach } from 'vitest';
import { useLevelStore, isBestRecord, sanitizeBestRecordMap } from '../../src/store/levelStore';
import type { BestRecord } from '../../src/store/levelStore';

function rec(over: Partial<BestRecord> = {}): BestRecord {
  return {
    levelId: 'l1', timeUsed: 30, collected: 1, total: 2, date: '2026-06-06T00:00:00Z',
    ...over,
  };
}

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
