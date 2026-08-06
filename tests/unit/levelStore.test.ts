import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
      expect(sanitizeBestRecordMap({ good, bad })).toEqual({ map: { good }, dropped: ['bad'] });
    });

    // P2-21 cleanup: the previous in-file 4-item VALID_ALGORITHMS in
    // levelStore had drifted from the 15-item whitelist in seed.ts after
    // P2-19 / P2-20 / P2-21 added 11 algorithms. The drift silently
    // dropped best records for the newer algorithms during init — a
    // player who finished a Wilson's run would have the record erased
    // on the next page load. These two cases pin the post-fix behavior
    // so a future re-introduction of the parallel list fails loudly.
    it('accepts a record whose seed uses a P2-20 algorithm (wilsons)', () => {
      expect(isBestRecord(rec({
        levelId: 'algo-v1-wilsons-30-0123456789abcdef',
        seed: { algorithm: 'wilsons', size: 30, mazeSeed: '0123456789abcdef' },
      }))).toBe(true);
    });

    it('accepts a record whose seed uses a P2-21 algorithm (houston)', () => {
      expect(isBestRecord(rec({
        levelId: 'algo-v1-houston-15-fedcba9876543210',
        seed: { algorithm: 'houston', size: 15, mazeSeed: 'fedcba9876543210' },
      }))).toBe(true);
    });

    it('still rejects a record whose seed uses a fake algorithm (regression guard)', () => {
      // isBestRecord's seed guard must stay in lockstep with the
      // 15-algorithm whitelist — if a future refactor reintroduces a
      // stale parallel list, this case will fail.
      expect(isBestRecord(rec({
        seed: { ...PROC_SEED, algorithm: 'fake-algorithm' as 'recursive-backtracker' },
      }))).toBe(false);
    });
  });

  describe('sanitizeBestRecordMap', () => {
    // F-project-review-2026-06-13-D-10: signature changed from
    // `Record<string, BestRecord>` to `{ map, dropped }` so the caller
    // (levelStore init) can surface dropped keys as a one-time toast
    // instead of silently logging console.warn. The dropped list is the
    // contract — the previous "no UI feedback" path is what triggered
    // this finding.
    it('returns { map, dropped } with empty dropped for non-object input', () => {
      expect(sanitizeBestRecordMap(null)).toEqual({ map: {}, dropped: [] });
      expect(sanitizeBestRecordMap('bad')).toEqual({ map: {}, dropped: [] });
    });

    it('keeps valid records and lists the dropped keys', () => {
      const good = rec({ levelId: 'good' });
      const bad = rec({ levelId: 'bad', timeUsed: -1 });
      const input = { good, bad };
      expect(sanitizeBestRecordMap(input)).toEqual({ map: { good }, dropped: ['bad'] });
    });

    it('returns an empty dropped list when all records are valid', () => {
      const a = rec({ levelId: 'a' });
      const b = rec({ levelId: 'b' });
      expect(sanitizeBestRecordMap({ a, b })).toEqual({ map: { a, b }, dropped: [] });
    });

    it('lists every invalid key, in the input order (D-10 toast lists all dropped ids)', () => {
      const a = rec({ levelId: 'a' });
      const b = rec({ levelId: 'b', timeUsed: NaN });
      const c = rec({ levelId: 'c', collected: -1 });
      const d = rec({ levelId: 'd' });
      const result = sanitizeBestRecordMap({ a, b, c, d });
      expect(result.dropped).toEqual(['b', 'c']);
      expect(result.map).toEqual({ a, d });
    });
  });

  // F-project-review-2026-06-13-D-10: when init loads localStorage and
  // some records are rejected, the store must surface that as
  // `lastLoadSummary.recordsDroppedKeys` so the UI can show a toast.
  // A user who just lost 3 personal bests to a schema bump has no UI
  // surfacing of the loss otherwise — they only see the warning in
  // devtools.
  describe('D-10 lastLoadSummary from best-records init', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('is null when localStorage has no dropped records', async () => {
      localStorage.clear();
      vi.resetModules();
      const { useLevelStore: fresh } = await import('../../src/store/levelStore');
      expect(fresh.getState().lastLoadSummary).toBeNull();
    });

    it('records the dropped record keys when init drops invalid records', async () => {
      const good = rec({ levelId: 'good' });
      const bad1 = rec({ levelId: 'bad1', timeUsed: -1 });
      const bad2 = rec({ levelId: 'bad2', collected: 999, total: 1 });
      localStorage.setItem(
        'maze3d.levels.v1',
        JSON.stringify({ good, bad1, bad2 }),
      );
      vi.resetModules();
      const { useLevelStore: fresh } = await import('../../src/store/levelStore');
      const summary = fresh.getState().lastLoadSummary;
      expect(summary).not.toBeNull();
      expect(summary!.recordsDroppedKeys.sort()).toEqual(['bad1', 'bad2']);
      expect(summary!.customsDroppedKeys).toEqual([]);
      expect(summary!.recordsMigrationError).toBeNull();
      expect(summary!.customsMigrationError).toBeNull();
    });

    it('dismissLoadSummary clears the field back to null', async () => {
      const good = rec({ levelId: 'good' });
      const bad = rec({ levelId: 'bad', timeUsed: -1 });
      localStorage.setItem('maze3d.levels.v1', JSON.stringify({ good, bad }));
      vi.resetModules();
      const { useLevelStore: fresh } = await import('../../src/store/levelStore');
      expect(fresh.getState().lastLoadSummary).not.toBeNull();
      fresh.getState().dismissLoadSummary();
      expect(fresh.getState().lastLoadSummary).toBeNull();
    });
  });
});
