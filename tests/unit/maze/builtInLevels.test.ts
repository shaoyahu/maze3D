import { describe, it, expect } from 'vitest';
import { JsonMazeProvider } from '../../../src/maze/JsonMazeProvider';
import { BUILT_IN_JSON_PROVIDER } from '../../../src/maze/builtInLevels';
// Re-import under a different name for the singleton-identity test. ESM
// modules are cached, so two distinct bindings to the same module export
// must point at the same object — this is the property the hoist
// refactor relies on.
import { BUILT_IN_JSON_PROVIDER as BUILT_IN_JSON_PROVIDER_AGAIN } from '../../../src/maze/builtInLevels';

const EXPECTED_BUILT_IN_IDS = [
  'teaching-01',
  'teaching-02',
  'teaching-03',
  'teaching-04',
  'teaching-05',
  'teaching-06',
  'teaching-07',
  'teaching-08',
  // F-2026-07-01-FCR-C-2: restore the 4 legacy fixtures referenced by
  // pickup-types.spec / enemies.spec / play-through.spec /
  // persistence.spec. Their id-based `sublevel-select` selections are
  // the contract the E2E specs pin; keeping the files in /public/levels
  // is what makes that contract work end-to-end.
  'level-small',
  'level-tiny',
  'level-tiny-pickups',
  'level-tiny-enemy',
] as const;

describe('BUILT_IN_JSON_PROVIDER (F-project-review-2026-06-13-A-HIGH-4)', () => {
  it('is an instance of JsonMazeProvider', () => {
    // The hoist produces a real provider, not a factory. This pins the
    // public type so a future refactor that returns a lazy or function-
    // typed value trips this assertion.
    expect(BUILT_IN_JSON_PROVIDER).toBeInstanceOf(JsonMazeProvider);
  });

  it('is a module-level singleton (same reference on re-import)', () => {
    // The whole point of hoisting: ESM caches the module, so two
    // independent import bindings must resolve to the same object. If
    // a future change turns this into a factory, the test fails.
    expect(BUILT_IN_JSON_PROVIDER_AGAIN).toBe(BUILT_IN_JSON_PROVIDER);
  });

  it('exposes the built-in level ids from /public/levels', async () => {
    // The fixture directory is the source of truth; the glob in
    // builtInLevels.ts must surface every *.json file. Using
    // arrayContaining keeps the test stable when the fixture order
    // changes (Vite's import.meta.glob returns alphabetical by path,
    // but pinning the contract matters more than the order).
    const ids = await BUILT_IN_JSON_PROVIDER.list();
    expect(ids).toEqual(expect.arrayContaining([...EXPECTED_BUILT_IN_IDS]));
    expect(ids).toHaveLength(EXPECTED_BUILT_IN_IDS.length);
  });

  it('round-trips every listed id through load() with a valid MazeData', async () => {
    // list() ids are not the same thing as load()-able ids. A
    // misconfigured glob or a stale JSON import would surface here:
    // either load() throws (LevelLoadError) or returns a data
    // object whose walls grid doesn't match its declared size.
    const ids = await BUILT_IN_JSON_PROVIDER.list();
    for (const id of ids) {
      const data = await BUILT_IN_JSON_PROVIDER.load(id);
      expect(data.id).toBe(id);
      expect(data.walls.length).toBe(data.size.depth);
      expect(data.walls[0].length).toBe(data.size.width);
      // The validator rejects non-integer start/exit and walls off the
      // grid; the fixtures all pass, so we don't have to re-validate
      // every field here — but pinning the shape catches a
      // regression where the glob is wired to a stale path.
      expect(typeof data.name).toBe('string');
      expect(data.name.length).toBeGreaterThan(0);
    }
  });
});
