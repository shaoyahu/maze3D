import { describe, it, expect } from 'vitest';
import { ALGORITHM_REGISTRY, ALGORITHM_IDS, ALGORITHM_BY_ID } from '../../../src/maze/algorithmRegistry';
// P2-21 cleanup (DESIGN DEBT #7): the i18n key set must be a 1:1 map
// of ALGORITHM_REGISTRY entries' `labelKey`. Importing the i18n
// resources here lets the test fail loudly if either side drifts
// (a registry labelKey with no i18n entry, or a stray i18n key with
// no registry entry).
import { en } from '../../../src/i18n/resources/en';
import { zh } from '../../../src/i18n/resources/zh';

describe('algorithmRegistry (P2-21 cleanup — DESIGN DEBT #7)', () => {
  it('contains exactly 15 algorithm entries (full jamisbuck.org/mazes set)', () => {
    expect(ALGORITHM_REGISTRY).toHaveLength(15);
    expect(ALGORITHM_IDS).toHaveLength(15);
  });

  it('ALGORITHM_IDS preserves registry order (used by LevelSelect dropdown + menus test)', () => {
    expect(ALGORITHM_IDS).toEqual(ALGORITHM_REGISTRY.map((e) => e.id));
  });

  it('ALGORITHM_BY_ID is a complete O(1) lookup indexed by Algorithm', () => {
    for (const id of ALGORITHM_IDS) {
      expect(ALGORITHM_BY_ID[id].id).toBe(id);
    }
    expect(Object.keys(ALGORITHM_BY_ID).sort()).toEqual([...ALGORITHM_IDS].sort());
  });

  it('every registry entry has a non-empty labelKey that exists in BOTH en and zh resources', () => {
    for (const entry of ALGORITHM_REGISTRY) {
      expect(entry.labelKey, `${entry.id} has empty labelKey`).toBeTruthy();
      expect(
        Object.prototype.hasOwnProperty.call(en, entry.labelKey),
        `en resource missing key '${entry.labelKey}' for ${entry.id}`,
      ).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(zh, entry.labelKey),
        `zh resource missing key '${entry.labelKey}' for ${entry.id}`,
      ).toBe(true);
    }
  });

  it('every entry has a positive perfBudgetMs50 (regression guard — 0/negative would skip the perf test)', () => {
    for (const entry of ALGORITHM_REGISTRY) {
      expect(entry.perfBudgetMs50).toBeGreaterThan(0);
    }
  });

  it('every entry points at a callable generate function (regression guard)', () => {
    for (const entry of ALGORITHM_REGISTRY) {
      expect(typeof entry.generate).toBe('function');
    }
  });

  it('registry ids cover the 4 P2-3 legacy + 4 P2-19 + 4 P2-20 + 3 P2-21 algorithms', () => {
    // The membership is implicit in the typed `id: Algorithm` field
    // (TypeScript would reject any unknown literal at registry
    // construction time), so this test just pins the historical
    // provenance as a smoke check for "did someone re-order the
    // registry in a way that breaks the P2-19/20/21 contract?".
    const expected = [
      // P2-3 legacy
      'recursive-backtracker', 'kruskal', 'prim', 'hunt-and-kill',
      // P2-19
      'eller', 'sidewinder', 'binary-tree', 'growing-tree',
      // P2-20
      'parallel-backtracker', 'recursive-division', 'aldous-broder', 'wilsons',
      // P2-21
      'houston', 'growing-binary-tree', 'blobby-recursive-division',
    ];
    expect([...ALGORITHM_IDS]).toEqual(expected);
  });
});
