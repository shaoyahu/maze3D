import { describe, it, expect, beforeEach } from 'vitest';
import { useLevelStore } from '../../src/store/levelStore';
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
});
