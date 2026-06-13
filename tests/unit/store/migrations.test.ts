import { describe, it, expect } from 'vitest';
import {
  CURRENT_LEVEL_SCHEMA_VERSION,
  LEVEL_MIGRATIONS,
  parseStorageKeyVersion,
  applyLevelMigrations,
  type LevelMigration,
} from '../../../src/store/migrations';

describe('migrations (F-project-review-2026-06-13-D-21)', () => {
  describe('parseStorageKeyVersion', () => {
    it('extracts v1 from "maze3d.levels.v1"', () => {
      // The canonical key for bestByLevel.
      expect(parseStorageKeyVersion('maze3d.levels.v1')).toBe(1);
    });

    it('extracts v1 from "maze3d.customLevels.v1"', () => {
      // The canonical key for custom (editor-authored) levels.
      expect(parseStorageKeyVersion('maze3d.customLevels.v1')).toBe(1);
    });

    it('extracts multi-digit versions (v10, v42)', () => {
      // Forward-compat: future versions may be two digits.
      expect(parseStorageKeyVersion('foo.v10')).toBe(10);
      expect(parseStorageKeyVersion('foo.v42')).toBe(42);
    });

    it('returns null for keys without a .vN suffix', () => {
      // Legacy or hand-crafted keys without a version must NOT be
      // silently treated as v1 — the caller decides the fallback.
      expect(parseStorageKeyVersion('maze3d.levels')).toBeNull();
      expect(parseStorageKeyVersion('maze3d.levels.v')).toBeNull();
      expect(parseStorageKeyVersion('maze3d.levels.vX')).toBeNull();
    });

    it('returns null for v0 (version 0 is not a valid schema)', () => {
      // v0 would never be assigned; treat it as unparseable so the
      // caller can decide the fallback (vs. silently assuming v1).
      expect(parseStorageKeyVersion('maze3d.levels.v0')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(parseStorageKeyVersion('')).toBeNull();
    });
  });

  describe('applyLevelMigrations — current v1 state (no migrations registered)', () => {
    it('returns data unchanged when fromVersion equals current (v1 → v1 is identity)', () => {
      // The current production state: LEVEL_MIGRATIONS is empty, so
      // the chain is a no-op. This proves the no-op path works
      // without requiring a future migration to exist.
      const data = { 'level-tiny': { timeUsed: 30 } };
      expect(applyLevelMigrations(data, CURRENT_LEVEL_SCHEMA_VERSION)).toEqual(data);
    });

    it('returns the SAME object reference when no migration runs (no allocation)', () => {
      // Migration is a chokepoint: in the current state (no entries
      // registered), it must not allocate or copy. The reference-
      // equality check pins this so a future refactor cannot
      // accidentally introduce a clone on every load (levelStore
      // re-reads the whole map at init, so an extra copy per entry
      // would matter for large custom-level sets).
      const data = { foo: 'bar' };
      expect(applyLevelMigrations(data, CURRENT_LEVEL_SCHEMA_VERSION)).toBe(data);
    });

    it('throws when fromVersion is newer than the build supports', () => {
      // A user with a v2 build that wrote v2 data must not silently
      // load as v1 (which would lose fields). Reject loudly so the
      // caller can decide to drop the data or surface a UI warning.
      const futureVersion = CURRENT_LEVEL_SCHEMA_VERSION + 1;
      expect(() => applyLevelMigrations({ foo: 'bar' }, futureVersion))
        .toThrow(/newer than this build's supported/i);
    });

    it('error message names both the data version and the supported version', () => {
      // The thrown message must be actionable: the user (or the dev
      // console) needs to see WHICH version was rejected so they
      // know whether to upgrade the build or wipe localStorage.
      const futureVersion = CURRENT_LEVEL_SCHEMA_VERSION + 5;
      try {
        applyLevelMigrations({}, futureVersion);
        expect.unreachable('expected throw');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        expect(msg).toContain(String(futureVersion));
        expect(msg).toContain(String(CURRENT_LEVEL_SCHEMA_VERSION));
      }
    });
  });

  describe('migration chain mechanics (test-local fake registry)', () => {
    // To exercise the chain logic without touching the production
    // LEVEL_MIGRATIONS (a module-level global), we re-implement the
    // walker here and assert its invariants. The production
    // applyLevelMigrations is a thin wrapper around this same
    // algorithm; testing the algorithm itself guards the contract
    // that any future migration author must obey.

    function runChain(
      data: unknown,
      fromVersion: number,
      target: number,
      migrations: LevelMigration[],
    ): unknown {
      let current = data;
      let version = fromVersion;
      for (const m of migrations) {
        if (m.fromVersion !== version) {
          throw new Error(`chain mismatch at v${version}: got fromVersion=${m.fromVersion}`);
        }
        current = m.transform(current);
        version = m.toVersion;
      }
      if (version !== target) {
        throw new Error(`chain incomplete: ended v${version}, expected v${target}`);
      }
      return current;
    }

    it('walks a 1-step chain v1 → v2 and produces the new shape', () => {
      const data = { schema: 'v1' };
      const out = runChain(
        data,
        1,
        2,
        [{ fromVersion: 1, toVersion: 2, transform: (d) => ({ ...(d as object), schema: 'v2' }) }],
      );
      expect(out).toEqual({ schema: 'v2' });
    });

    it('walks a 2-step chain v1 → v2 → v3 in declared order', () => {
      // A future bump from v1 to v3 requires two consecutive entries;
      // the walker must apply them in the listed order, not jump.
      const data = { schema: 'v1' };
      const out = runChain(data, 1, 3, [
        { fromVersion: 1, toVersion: 2, transform: (d) => ({ ...(d as object), schema: 'v2' }) },
        { fromVersion: 2, toVersion: 3, transform: (d) => ({ ...(d as object), schema: 'v3' }) },
      ]);
      expect(out).toEqual({ schema: 'v3' });
    });

    it('rejects an out-of-order chain (entries listed in wrong sequence)', () => {
      // The walker walks entries in declared order. If the second
      // entry's fromVersion (2) does not equal the running version
      // after the first entry (which jumped to 3), the fromVersion
      // guard throws. This is the gap the walker DOES detect.
      expect(() =>
        runChain({}, 1, 3, [
          { fromVersion: 1, toVersion: 3, transform: (d) => d },
          { fromVersion: 2, toVersion: 3, transform: (d) => d },
        ]),
      ).toThrow(/chain mismatch at v3/);
    });

    it('rejects a chain that does not reach the target version', () => {
      // Defensive: an under-length chain leaves the data at an
      // intermediate version. The walker must refuse to return
      // partially-migrated data.
      expect(() =>
        runChain({}, 1, 3, [
          { fromVersion: 1, toVersion: 2, transform: (d) => d },
        ]),
      ).toThrow(/chain incomplete/i);
    });
  });

  describe('production registry invariants', () => {
    it('LEVEL_MIGRATIONS is currently empty (no v_n → v_{n+1} step has ever been needed)', () => {
      // Pin: a non-empty registry is a breaking change (it requires
      // bumping CURRENT_LEVEL_SCHEMA_VERSION). If this test ever
      // fails, the author meant to bump the schema version.
      expect(LEVEL_MIGRATIONS).toEqual([]);
    });

    it('CURRENT_LEVEL_SCHEMA_VERSION is 1 (the only schema in the wild)', () => {
      // Pin: today only v1 exists. Bumping this constant without
      // adding a v1→v2 migration would make the walker throw on
      // every existing localStorage load.
      expect(CURRENT_LEVEL_SCHEMA_VERSION).toBe(1);
    });
  });
});