import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useLevelStore } from '../../../src/store/levelStore';
import type { MazeData } from '../../../src/maze/types';

const STORAGE_KEY = 'maze3d.customLevels.v1';

function makeMaze(over: Partial<MazeData> = {}): MazeData {
  return {
    id: 'custom-test-1',
    name: 'Test Level',
    size: { width: 3, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 2, z: 2 },
    walls: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ],
    pickups: [],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
    enemies: [],
    traps: [],
    doors: [],
    ...over,
  };
}

describe('levelStore.customLevels', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    useLevelStore.setState({ customLevels: {} });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('init', () => {
    it('starts with an empty customLevels map when localStorage is empty', () => {
      expect(useLevelStore.getState().customLevels).toEqual({});
    });
  });

  describe('saveCustom', () => {
    it('persists the level to localStorage and updates state', () => {
      // Arrange
      const level = makeMaze({ id: 'custom-aaa' });
      // Act
      useLevelStore.getState().saveCustom(level);
      // Assert
      expect(useLevelStore.getState().customLevels['custom-aaa']).toEqual(level);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored['custom-aaa']).toEqual(level);
    });

    it('overwrites an existing entry when called twice with the same id', () => {
      // Arrange
      const v1 = makeMaze({ id: 'custom-aaa', name: 'v1' });
      const v2 = makeMaze({ id: 'custom-aaa', name: 'v2' });
      // Act
      useLevelStore.getState().saveCustom(v1);
      useLevelStore.getState().saveCustom(v2);
      // Assert
      expect(useLevelStore.getState().customLevels['custom-aaa']?.name).toBe('v2');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored['custom-aaa']?.name).toBe('v2');
    });

    it('throws and writes nothing when the level is structurally invalid (start on a wall)', () => {
      // Arrange
      const bad = makeMaze({
        id: 'custom-bad',
        start: { x: 0, z: 0 },
        walls: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 0],
        ],
      });
      // Act / Assert
      expect(() => useLevelStore.getState().saveCustom(bad)).toThrow();
      expect(useLevelStore.getState().customLevels['custom-bad']).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('init from localStorage', () => {
    it('reads and sanitizes entries on init: valid entries survive, invalid ones are dropped with console.warn', async () => {
      // Arrange — populate localStorage with a mix of valid + invalid entries,
      // then re-import the module to trigger the IIFE re-read.
      const good = makeMaze({ id: 'custom-good', name: 'good' });
      const badShape = { id: 'custom-bad', name: 'bad' }; // missing size/walls/etc.
      const seed = { [good.id]: good, [badShape.id]: badShape };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

      // Re-import the module to trigger the IIFE re-read.
      // The warnSpy from beforeEach patches the shared `console` global, so the
      // freshly-evaluated module's `console.warn` reference still routes through
      // the spy. vi.resetModules() only discards the module cache, not global
      // patches; therefore warnSpy reliably observes the IIFE's warning here.
      vi.resetModules();
      const { useLevelStore: freshStore } = await import('../../../src/store/levelStore');
      // Act / Assert
      const levels = freshStore.getState().customLevels;
      expect(levels['custom-good']).toEqual(good);
      expect(levels['custom-bad']).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });

    // F-project-review-2026-06-13-D-10: when init drops invalid custom
    // levels, the dropped keys must land in `lastLoadSummary.customsDroppedKeys`
    // so the UI can show a one-time toast. Without this, a user whose
    // hand-crafted custom levels were rejected for a schema-bump reason
    // would only see `console.warn` and assume everything is fine.
    it('D-10: init records customsDroppedKeys in lastLoadSummary when entries are dropped', async () => {
      const good = makeMaze({ id: 'custom-good', name: 'good' });
      const badShape = { id: 'custom-bad', name: 'bad' }; // missing size/walls/etc.
      const seed = { [good.id]: good, [badShape.id]: badShape };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

      vi.resetModules();
      const { useLevelStore: freshStore } = await import('../../../src/store/levelStore');
      const summary = freshStore.getState().lastLoadSummary;
      expect(summary).not.toBeNull();
      expect(summary!.customsDroppedKeys).toEqual(['custom-bad']);
      expect(summary!.recordsDroppedKeys).toEqual([]);
    });

    it('D-10: init sets lastLoadSummary to null when every entry survives sanitization', async () => {
      const good = makeMaze({ id: 'custom-good', name: 'good' });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ [good.id]: good }));
      vi.resetModules();
      const { useLevelStore: freshStore } = await import('../../../src/store/levelStore');
      expect(freshStore.getState().lastLoadSummary).toBeNull();
    });

    it('D-10: dismissLoadSummary clears the field', async () => {
      const good = makeMaze({ id: 'custom-good', name: 'good' });
      const badShape = { id: 'custom-bad', name: 'bad' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ [good.id]: good, [badShape.id]: badShape }));
      vi.resetModules();
      const { useLevelStore: freshStore } = await import('../../../src/store/levelStore');
      expect(freshStore.getState().lastLoadSummary).not.toBeNull();
      freshStore.getState().dismissLoadSummary();
      expect(freshStore.getState().lastLoadSummary).toBeNull();
    });
  });

  describe('deleteCustom', () => {
    it('removes the level from both state and localStorage', () => {
      // Arrange
      useLevelStore.getState().saveCustom(makeMaze({ id: 'custom-aaa' }));
      // Act
      useLevelStore.getState().deleteCustom('custom-aaa');
      // Assert
      expect(useLevelStore.getState().customLevels['custom-aaa']).toBeUndefined();
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored['custom-aaa']).toBeUndefined();
    });

    it('is a no-op when the id does not exist', () => {
      // Arrange
      useLevelStore.getState().saveCustom(makeMaze({ id: 'custom-aaa' }));
      // Act / Assert
      expect(() => useLevelStore.getState().deleteCustom('custom-nope')).not.toThrow();
      expect(useLevelStore.getState().customLevels['custom-aaa']).toBeDefined();
    });
  });

  describe('getCustom', () => {
    it('returns the level for a known id', () => {
      const level = makeMaze({ id: 'custom-aaa' });
      useLevelStore.getState().saveCustom(level);
      expect(useLevelStore.getState().getCustom('custom-aaa')).toEqual(level);
    });

    it('returns undefined for a missing id', () => {
      expect(useLevelStore.getState().getCustom('custom-missing')).toBeUndefined();
    });
  });

  describe('listCustom', () => {
    it('returns all custom level ids', () => {
      // Arrange
      useLevelStore.getState().saveCustom(makeMaze({ id: 'custom-aaa' }));
      useLevelStore.getState().saveCustom(makeMaze({ id: 'custom-bbb' }));
      // Act
      const ids = useLevelStore.getState().listCustom();
      // Assert
      expect(ids.sort()).toEqual(['custom-aaa', 'custom-bbb']);
    });

    it('returns an empty array when no custom levels exist', () => {
      expect(useLevelStore.getState().listCustom()).toEqual([]);
    });
  });
});
