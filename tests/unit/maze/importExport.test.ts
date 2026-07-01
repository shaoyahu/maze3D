import { describe, it, expect, beforeEach } from 'vitest';
import {
  exportLevel,
  parseImport,
  ImportError,
  sanitizeFilename,
  downloadAsJsonFile,
  readJsonFile,
  MAX_IMPORT_BYTES,
} from '../../../src/maze/importExport';
import type { MazeData } from '../../../src/maze/types';

// Minimal well-formed level fixture. Mirrors the factory used in
// JsonMazeProvider.test.ts so the parser/validator sees the same shape it
// sees at runtime.
function makeValidLevel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'level-test',
    name: 'Test Level',
    size: { width: 5, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 4, z: 2 },
    walls: [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ],
    pickups: [],
    rules: {
      initialTime: 30,
      maxHealth: 3,
      victory: 'reach-exit',
      timeOnPickup: 10,
    },
    // F-2026-06-15-H-3.2: enemies is now a required field per MazeData
    // schema; default to [] for fixture minimalism.
    enemies: [],
    ...overrides,
  };
}

describe('importExport', () => {
  describe('exportLevel + parseImport roundtrip', () => {
    it('roundtrips a well-formed level and preserves all top-level fields', () => {
      // Arrange
      const level = makeValidLevel() as unknown as MazeData;

      // Act
      const json = exportLevel(level);
      const parsed = JSON.parse(json);
      const { level: parsedLevel, nameToPreserve } = parseImport(json);

      // Assert — envelope shape
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.level).toBeDefined();

      // Assert — roundtripped fields
      expect(parsedLevel.id).toBe(level.id);
      expect(parsedLevel.name).toBe(level.name);
      expect(parsedLevel.size).toEqual(level.size);
      expect(parsedLevel.cellSize).toBe(level.cellSize);
      expect(parsedLevel.start).toEqual(level.start);
      expect(parsedLevel.exit).toEqual(level.exit);
      expect(parsedLevel.walls).toEqual(level.walls);
      expect(parsedLevel.pickups).toEqual(level.pickups);
      expect(parsedLevel.rules).toEqual(level.rules);

      // Assert — nameToPreserve is the original level name
      expect(nameToPreserve).toBe(level.name);
    });

    it('produces pretty-printed JSON (indent of 2)', () => {
      // Arrange
      const level = makeValidLevel() as unknown as MazeData;

      // Act
      const json = exportLevel(level);

      // Assert — a newline after the opening brace signals pretty-print
      expect(json).toContain('\n  "schemaVersion"');
    });

    // F-2026-06-17-D-L-4: explicit roundtrip coverage for the 5 P2-11
    // fields. Without these, a future validator regression that swallows
    // a P2-11 field would pass the existing "top-level fields" assertion
    // because the top-level keys would still be present (just with
    // `undefined` sub-fields). The pattern mirrors
    // tests/unit/maze/levels.test.ts:108-139.
    //
    // F-2026-06-30: P2-16 — `hideMinimap` is no longer round-tripped;
    // the validator migrates it to `rules.minimapMode: 'hidden'`. The
    // roundtrip assertion now checks that the migrated field survives
    // exportLevel → parseImport. Without this update, the previous
    // `hideMinimap` test would silently flip from "pass" to "expected
    // undefined to be true" as soon as the migration landed.
    it.each([
      ['i18n', { i18n: { en: 'Sentinel Corridor' } }, (lvl: MazeData) => lvl.i18n],
      [
        'tutorialSteps',
        { tutorialSteps: [{ id: 's1', messageKey: 'tutorial.s1', trigger: { type: 'timeout', timeoutSec: 5 } }] },
        (lvl: MazeData) => lvl.tutorialSteps,
      ],
      [
        'rules.minimapMode (P2-16)',
        { rules: { ...makeValidLevel().rules as object, minimapMode: 'parchment' } as MazeData['rules'] },
        (lvl: MazeData) => lvl.rules.minimapMode,
      ],
      [
        'rules.enemyAggression',
        { rules: { ...makeValidLevel().rules as object, enemyAggression: 'medium' } as MazeData['rules'] },
        (lvl: MazeData) => lvl.rules.enemyAggression,
      ],
      [
        'rules.requireAllPickups',
        { rules: { ...makeValidLevel().rules as object, requireAllPickups: true } as MazeData['rules'] },
        (lvl: MazeData) => lvl.rules.requireAllPickups,
      ],
    ])('roundtrips the P2-11 field %s (F-2026-06-17-D-L-4)', (_label, overrides, getter) => {
      const level = makeValidLevel(overrides as Record<string, unknown>) as unknown as MazeData;
      const json = exportLevel(level);
      const { level: parsedLevel } = parseImport(json);
      expect(getter(parsedLevel)).toBeDefined();
      expect(getter(parsedLevel)).toEqual(getter(level));
    });
  });

  describe('parseImport error handling', () => {
    it('throws ImportError when schemaVersion is not 1', () => {
      // Arrange — schemaVersion = 2 is the rejection case from the spec
      const json = JSON.stringify({ schemaVersion: 2, level: makeValidLevel() });

      // Act + Assert
      expect(() => parseImport(json)).toThrow(ImportError);
    });

    it('throws ImportError when schemaVersion is missing entirely', () => {
      // Arrange — no schemaVersion key at all
      const json = JSON.stringify({ level: makeValidLevel() });

      // Act + Assert
      expect(() => parseImport(json)).toThrow(ImportError);
    });

    it('throws ImportError when the level field is missing', () => {
      // Arrange — envelope present, but no `level` key
      const json = JSON.stringify({ schemaVersion: 1 });

      // Act + Assert
      expect(() => parseImport(json)).toThrow(ImportError);
    });

    it('wraps a validateMaze failure (missing size) in ImportError', () => {
      // Arrange — level lacks `size`; validateMaze will reject it.
      const broken = { ...makeValidLevel() } as Record<string, unknown>;
      delete broken.size;
      const json = JSON.stringify({ schemaVersion: 1, level: broken });

      // Act + Assert — must be ImportError, not a raw Error or LevelLoadError
      expect(() => parseImport(json)).toThrow(ImportError);
    });

    it('throws ImportError when the input is not valid JSON', () => {
      // Arrange
      const raw = '{not valid json';

      // Act + Assert
      expect(() => parseImport(raw)).toThrow(ImportError);
    });

    it('ImportError is a subclass of Error', () => {
      // Arrange + Act
      const e = new ImportError('test');

      // Assert
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe('ImportError');
      expect(e.message).toBe('test');
    });
  });

  describe('sanitizeFilename', () => {
    it('replaces Chinese characters with underscores', () => {
      // Arrange
      const name = '我的关卡';

      // Act
      const result = sanitizeFilename(name);

      // Assert — each CJK char is outside [\w-], so all 4 become underscores
      expect(result).toBe('____');
    });

    it('replaces spaces with underscores', () => {
      // Arrange
      const name = 'my level';

      // Act
      const result = sanitizeFilename(name);

      // Assert
      expect(result).toBe('my_level');
    });

    it('preserves word chars, hyphens, and underscores unchanged', () => {
      // Arrange
      const name = 'my-level_v2';

      // Act
      const result = sanitizeFilename(name);

      // Assert
      expect(result).toBe('my-level_v2');
    });

    it('replaces a mix of punctuation, spaces, and unicode with underscores', () => {
      // Arrange
      const name = 'Level 1! (final) — boss';

      // Act
      const result = sanitizeFilename(name);

      // Assert — every char outside [\w-] becomes `_`
      expect(result).toBe('Level_1___final____boss');
    });
  });

  describe('downloadAsJsonFile', () => {
    beforeEach(() => {
      // happy-dom's createObjectURL is a no-op stub by default; we don't
      // assert on the URL, only that the function does not throw and does
      // not leak the temporary URL after revoking.
      if (typeof URL.createObjectURL !== 'function') {
        URL.createObjectURL = () => 'blob:mock';
      }
      if (typeof URL.revokeObjectURL !== 'function') {
        URL.revokeObjectURL = () => undefined;
      }
    });

    it('does not throw when given a valid filename and content', () => {
      // Arrange
      const filename = 'level.maze3d.json';
      const content = '{"hello":"world"}';

      // Act + Assert
      expect(() => downloadAsJsonFile(filename, content)).not.toThrow();
    });

    it('calls URL.createObjectURL with a Blob whose contents match the input', () => {
      // Arrange
      let captured: Blob | null = null;
      const original = URL.createObjectURL;
      URL.createObjectURL = (obj: Blob | MediaSource): string => {
        captured = obj as Blob;
        return 'blob:mock';
      };
      const filename = 'level.maze3d.json';
      const content = '{"hello":"world"}';

      // Act
      try {
        downloadAsJsonFile(filename, content);
      } finally {
        URL.createObjectURL = original;
      }

      // Assert — a Blob was created
      expect(captured).not.toBeNull();
      expect(captured).toBeInstanceOf(Blob);
    });
  });

  describe('readJsonFile', () => {
    function makeFile(name: string, content: string, type = 'application/json'): File {
      return new File([content], name, { type });
    }

    it('returns the file text for a .json extension', async () => {
      // Arrange
      const file = makeFile('level.json', '{"a":1}');

      // Act
      const result = await readJsonFile(file);

      // Assert
      expect(result).toBe('{"a":1}');
    });

    it('returns the file text for a .maze3d.json extension', async () => {
      // Arrange
      const file = makeFile('level.maze3d.json', '{"a":2}');

      // Act
      const result = await readJsonFile(file);

      // Assert
      expect(result).toBe('{"a":2}');
    });

    it('throws ImportError for a non-json extension', async () => {
      // Arrange
      const file = makeFile('level.txt', '{"a":3}');

      // Act + Assert
      await expect(readJsonFile(file)).rejects.toThrow(ImportError);
    });

    it('throws ImportError for a file with no extension', async () => {
      // Arrange
      const file = makeFile('level', '{"a":4}');

      // Act + Assert
      await expect(readJsonFile(file)).rejects.toThrow(ImportError);
    });

    // D-25: readJsonFile must reject absurdly large files before
    // loading them into memory. Without the guard, a 500 MB JSON pick
    // freezes the tab via FileReader.readAsText + JSON.parse blocking
    // the main thread. We synthesize a small file and override the
    // `size` getter to report the over-limit value, so the test stays
    // fast (no actual 1 MB allocation) while still exercising the
    // real guard path: the implementation reads `file.size` before
    // calling `file.text()`.
    it('throws ImportError when file.size exceeds MAX_IMPORT_BYTES (D-25)', async () => {
      // Arrange — real File with 1 byte, then spoof the size to
      // MAX_IMPORT_BYTES + 1 so the guard trips.
      const file = makeFile('huge.json', 'x');
      Object.defineProperty(file, 'size', {
        value: MAX_IMPORT_BYTES + 1,
        configurable: true,
      });

      // Act + Assert
      await expect(readJsonFile(file)).rejects.toThrow(ImportError);
      await expect(readJsonFile(file)).rejects.toThrow(/too large/i);
    });

    it('accepts a file at exactly MAX_IMPORT_BYTES (boundary is strict >)', async () => {
      // Arrange — spoof size to exactly the cap; the guard's strict
      // `>` comparison must let this through to file.text().
      const file = makeFile('boundary.json', '{"a":5}');
      Object.defineProperty(file, 'size', {
        value: MAX_IMPORT_BYTES,
        configurable: true,
      });

      // Act
      const result = await readJsonFile(file);

      // Assert
      expect(result).toBe('{"a":5}');
    });

    it('error message names both the actual and maximum size for the user (D-25)', async () => {
      // Arrange — spoof to a recognizable over-limit value.
      const file = makeFile('huge.json', 'x');
      const overLimit = MAX_IMPORT_BYTES + 12345;
      Object.defineProperty(file, 'size', { value: overLimit, configurable: true });

      // Act
      let caught: unknown;
      try {
        await readJsonFile(file);
      } catch (e) {
        caught = e;
      }

      // Assert — the message exposes the actual size and the cap so
      // the user can see how much they overran by.
      expect(caught).toBeInstanceOf(ImportError);
      expect((caught as Error).message).toContain(String(overLimit));
      expect((caught as Error).message).toContain(String(MAX_IMPORT_BYTES));
    });
  });
});
