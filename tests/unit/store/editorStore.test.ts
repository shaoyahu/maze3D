// P2-4b Task 8: useEditorStore (核心) tests.
//
// TDD scaffold for the editor's main Zustand store. Each test resets state
// via `useEditorStore.setState({...})` in beforeEach so cases stay
// independent. AAA structure throughout (Arrange / Act / Assert blocks).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useLevelStore } from '../../../src/store/levelStore';
import type { MazeData, Pickup, EnemySpawn, LevelRules, CellType } from '../../../src/maze/types';
import { validateMaze } from '../../../src/maze/JsonMazeProvider';

// Subject under test. The import path points to a module that does not
// exist yet — these tests should be RED at first run.
import { useEditorStore } from '../../../src/store/editorStore';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeMaze(over: Partial<MazeData> = {}): MazeData {
  return {
    id: 'custom-seed',
    name: 'seed',
    size: { width: 5, depth: 4 },
    cellSize: 2,
    // P3-1: every P3-1 defaulted field is mirrored in the factory
    // so `toEqual` against a `validateMaze` round-trip doesn't
    // fail on the new defaults. A pre-P3-1 hand-crafted level
    // (no `level` / `levelCount` / `transitions`) goes through
    // the same default-fill and comes out byte-equivalent to this
    // factory's output.
    start: { x: 0, z: 0, level: 0 },
    exit: { x: 4, z: 3, level: 0 },
    levelCount: 1,
    transitions: [],
    // All-walls grid: every cell is a wall. The editor starts with an
    // empty (fully-walled) canvas and the user carves out floors.
    walls: [
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
    ],
    pickups: [],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
    enemies: [],
    traps: [],
    doors: [],
    ...over,
  };
}

const DRAFT_KEY = 'maze3d.editorDraft.v1';

beforeEach(() => {
  // Reset level store between tests so saveLevel is observable.
  localStorage.clear();
  useLevelStore.setState({ customLevels: {} });
  // Reset editor store to a clean baseline.
  useEditorStore.setState({
    level: makeMaze(),
    tool: 'select',
    selection: null,
    camera: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    dirty: false,
    lastSavedAt: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useEditorStore', () => {
  // -----------------------------------------------------------------------
  // 1. init / newLevel
  // -----------------------------------------------------------------------
  describe('newLevel', () => {
    it('produces a level with the right id prefix, default name, walls = 1 except for the carved start/exit cells, and default rules', () => {
      // Arrange / Act
      useEditorStore.getState().newLevel(5, 4);

      // Assert
      const lvl = useEditorStore.getState().level;
      expect(lvl.id.startsWith('custom-')).toBe(true);
      expect(lvl.name).toBe('新关卡');
      expect(lvl.size).toEqual({ width: 5, depth: 4 });
      expect(lvl.start).toEqual({ x: 0, z: 0, level: 0 });
      expect(lvl.exit).toEqual({ x: 4, z: 3, level: 0 });
      expect(lvl.walls).toHaveLength(4);
      // F-2026-06-17: a fresh level is now a fully open floor (all 0s) —
      // matching the user's mental model of a "blank canvas". The W
      // tool places walls down; the previous "all-walls + carve start/exit"
      // shape was demoted to a footgun. The start/exit carve calls in
      // buildEmptyLevel remain (defensive) but no longer affect the
      // visible grid.
      for (let z = 0; z < lvl.walls.length; z += 1) {
        for (let x = 0; x < lvl.walls[z]!.length; x += 1) {
          expect(lvl.walls[z]![x]).toBe(0);
        }
      }
      expect(lvl.pickups).toEqual([]);
      expect(lvl.enemies).toEqual([]);
      expect(lvl.rules).toEqual({
        initialTime: 60,
        maxHealth: 3,
        victory: 'reach-exit',
        timeOnPickup: 10,
      });
    });

    // F-2026-06-12-T2-a: `newLevel` used to produce an all-walls canvas with start and
    // exit ON walls, so saving immediately failed `validateMaze` with
    // "start is on a wall" / "exit is on a wall". The user had to manually
    // carve two cells before Save would even work — the exact scenario the
    // user complained about ("打开不修改也无法保存"). After the fix the
    // new level is structurally valid by default; the user only has to
    // re-carve after deliberate edits that introduce walls.
    it('produces a level that passes validateMaze out of the box (no manual carving required)', () => {
      // Arrange / Act
      useEditorStore.getState().newLevel(5, 4);
      // Assert
      const lvl = useEditorStore.getState().level;
      expect(() => validateMaze(lvl, lvl.id)).not.toThrow();
    });

    it('produces a valid level for non-square sizes where start and exit land on different cells', () => {
      // Arrange / Act — 2x1 grid: start=(0,0), exit=(1,0), different cells.
      useEditorStore.getState().newLevel(2, 1);
      // Assert
      const lvl = useEditorStore.getState().level;
      expect(() => validateMaze(lvl, lvl.id)).not.toThrow();
    });

    it('resets the history stack (canUndo === false)', () => {
      // Arrange — push something onto history first.
      useEditorStore.setState({ past: [{ level: makeMaze(), selection: null }] });
      // Act
      useEditorStore.getState().newLevel(3, 3);
      // Assert
      expect(useEditorStore.getState().past).toEqual([]);
      expect(useEditorStore.getState().future).toEqual([]);
    });

    it('resets dirty to false', () => {
      // Arrange
      useEditorStore.setState({ dirty: true });
      // Act
      useEditorStore.getState().newLevel(3, 3);
      // Assert
      expect(useEditorStore.getState().dirty).toBe(false);
    });

    // F-2026-06-12-M3: `newLevel(0, n)` and `newLevel(n, 0)` used to crash
    // with `TypeError: Cannot set properties of undefined` because
    // `buildEmptyLevel` carved `walls[depth-1]!` without first checking
    // that depth >= 1. Surface the bad input as a clear RangeError.
    it('throws RangeError when width is 0', () => {
      expect(() => useEditorStore.getState().newLevel(0, 4)).toThrow(RangeError);
    });
    it('throws RangeError when depth is 0', () => {
      expect(() => useEditorStore.getState().newLevel(5, 0)).toThrow(RangeError);
    });
    it('throws RangeError when width is negative', () => {
      expect(() => useEditorStore.getState().newLevel(-1, 4)).toThrow(RangeError);
    });
  });

  // -----------------------------------------------------------------------
  // 2. loadLevel
  // -----------------------------------------------------------------------
  describe('loadLevel', () => {
    it('replaces the current level with the supplied maze', () => {
      // Arrange
      const incoming = makeMaze({ id: 'custom-loaded', name: 'Loaded' });
      // Act
      useEditorStore.getState().loadLevel(incoming);
      // Assert
      expect(useEditorStore.getState().level).toEqual(incoming);
    });

    it('resets history and dirty', () => {
      // Arrange
      useEditorStore.setState({
        past: [{ level: makeMaze(), selection: null }],
        future: [{ level: makeMaze(), selection: null }],
        dirty: true,
      });
      // Act
      useEditorStore.getState().loadLevel(makeMaze({ id: 'custom-x', name: 'x' }));
      // Assert
      expect(useEditorStore.getState().past).toEqual([]);
      expect(useEditorStore.getState().future).toEqual([]);
      expect(useEditorStore.getState().dirty).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 3. saveLevel
  // -----------------------------------------------------------------------
  describe('saveLevel', () => {
    // F-project-review-2026-06-13-A-HIGH-2: the prior contract had
    // `saveLevel` call `useLevelStore.saveCustom(level)` as a side
    // effect, which silently coupled the two stores. The new contract
    // returns the validated `level` so the caller (EditorToolbar,
    // EditorPage, useAutoSave) decides where to persist. This test
    // pins the new shape and asserts that saveLevel does NOT touch
    // the level store directly.
    it('returns the validated level and does not write to level store', () => {
      // Arrange — start must be on a floor cell for validateMaze to accept it.
      const lvl = makeMaze({
        id: 'custom-save',
        walls: [
          [0, 0, 0, 0, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
        ],
      });
      useEditorStore.setState({ level: lvl });
      const spy = vi.spyOn(useLevelStore.getState(), 'saveCustom');
      // Act
      const result = useEditorStore.getState().saveLevel();
      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.level).toEqual(lvl);
      }
      // The decoupled saveLevel must NOT persist to level store — that
      // is the caller's responsibility now. customLevels stays empty.
      expect(spy).not.toHaveBeenCalled();
      expect(useLevelStore.getState().customLevels).toEqual({});
    });

    it('sets dirty to false after a save', () => {
      // Arrange — start on a floor cell so validateMaze doesn't reject.
      const lvl = makeMaze({
        walls: [
          [0, 0, 0, 0, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
        ],
      });
      useEditorStore.setState({ level: lvl, dirty: true });
      // Act
      useEditorStore.getState().saveLevel();
      // Assert
      expect(useEditorStore.getState().dirty).toBe(false);
    });

    // F-2026-06-12-S1: surface the validator's real error message instead
    // of swallowing it as a boolean. Callers (toolbar) must be able to
    // show *what* is structurally wrong, not just "something is wrong".
    it('returns { ok: true } on a successful save', () => {
      // Arrange — start on a floor cell so validateMaze passes.
      const lvl = makeMaze({
        walls: [
          [0, 0, 0, 0, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
        ],
      });
      useEditorStore.setState({ level: lvl, dirty: true });
      // Act
      const result = useEditorStore.getState().saveLevel();
      // Assert
      expect(result).toEqual({ ok: true, level: lvl });
    });

    it('returns { ok: false, error } with the validator detail when the level is invalid', () => {
      // Arrange — start (0,0) is on a wall, so validateMaze should throw
      // `start is on a wall`.
      const lvl = makeMaze({
        walls: [
          [1, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
      });
      useEditorStore.setState({ level: lvl, dirty: true });
      // Act
      const result = useEditorStore.getState().saveLevel();
      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/start is on a wall/);
      }
    });

    it('leaves dirty=true when the save fails so the user knows state still diverges', () => {
      // Arrange — exit on a wall, validateMaze will reject.
      const lvl = makeMaze({
        walls: [
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 1],
        ],
      });
      useEditorStore.setState({ level: lvl, dirty: true });
      // Act
      const result = useEditorStore.getState().saveLevel();
      // Assert
      expect(result.ok).toBe(false);
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('returns { ok: true } when a freshly-loaded valid level is saved without modification', () => {
      // The user's stated expectation: opening a level and saving it
      // without any edits should always succeed. Validates idempotence
      // of validateMaze for the load → save round-trip.
      const lvl = makeMaze({
        walls: [
          [0, 0, 0, 0, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
        ],
      });
      useEditorStore.getState().loadLevel(lvl);
      // Act — no edits at all.
      const result = useEditorStore.getState().saveLevel();
      // Assert
      expect(result).toEqual({ ok: true, level: lvl });
      expect(useEditorStore.getState().dirty).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 4. setTool / setCamera / select / clearSelection (UI-state actions)
  // -----------------------------------------------------------------------
  describe('setTool / setCamera / select / clearSelection', () => {
    it('setTool updates the active tool and does NOT push history', () => {
      // Arrange
      const past = useEditorStore.getState().past.length;
      // Act
      useEditorStore.getState().setTool('wall');
      // Assert
      expect(useEditorStore.getState().tool).toBe('wall');
      expect(useEditorStore.getState().past.length).toBe(past);
    });

    // F-2026-06-16-L-1: switching the tool is a clear "I want to do
    // something new" gesture — any error message left over from a
    // previous rejection (e.g. "wallOnStart") is no longer relevant.
    it('setTool clears lastErrorKey so the toolbar chip stops showing a stale error', () => {
      useEditorStore.setState({
        lastError: 'stale',
        lastErrorKey: 'editor.lastError.wallOnStart',
      });
      useEditorStore.getState().setTool('wall');
      expect(useEditorStore.getState().lastError).toBeNull();
      expect(useEditorStore.getState().lastErrorKey).toBeNull();
    });

    it('setCamera merges a partial patch and does NOT push history', () => {
      // Arrange
      useEditorStore.setState({ camera: { x: 0, y: 5, zoom: 1 } });
      const past = useEditorStore.getState().past.length;
      // Act
      useEditorStore.getState().setCamera({ y: 12 });
      // Assert
      expect(useEditorStore.getState().camera).toEqual({ x: 0, y: 12, zoom: 1 });
      expect(useEditorStore.getState().past.length).toBe(past);
    });

    it('select sets selection and does NOT push history', () => {
      // Arrange
      const past = useEditorStore.getState().past.length;
      // Act
      useEditorStore.getState().select({ kind: 'pickup', id: 'p1' });
      // Assert
      expect(useEditorStore.getState().selection).toEqual({ kind: 'pickup', id: 'p1' });
      expect(useEditorStore.getState().past.length).toBe(past);
    });

    it('clearSelection sets selection to null and does NOT push history', () => {
      // Arrange
      useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
      const past = useEditorStore.getState().past.length;
      // Act
      useEditorStore.getState().clearSelection();
      // Assert
      expect(useEditorStore.getState().selection).toBeNull();
      expect(useEditorStore.getState().past.length).toBe(past);
    });
  });

  // -----------------------------------------------------------------------
  // 5. placeWall
  // -----------------------------------------------------------------------
  describe('placeWall', () => {
    // F-P2-9: placeWall is now strictly set-to-1 (no toggle). The
    // previous "toggles 1→0" test was a relic of the buggy toggle
    // behaviour that contradicted the toolbar label "墙体" and the
    // hint "在格子上点击放置墙体".
    it('sets walls[z][x] from 0→1, sets dirty, and pushes history', () => {
      // Arrange — start with a floor cell at (2,1).
      useEditorStore.setState({
        level: makeMaze({
          walls: [
            [1, 1, 1, 1, 1],
            [1, 1, 0, 1, 1],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
          ],
        }),
        past: [],
      });
      // Act — (2,1) is a floor cell, not start (0,0) nor exit (4,3).
      useEditorStore.getState().placeWall(2, 1);
      // Assert
      expect(useEditorStore.getState().level.walls[1]![2]).toBe(1);
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    // F-P2-9: a click on an already-wall cell is now a strict no-op
    // (avoids redundant history entries and surprises). Legacy toggle
    // tests asserted "0→1 on second call"; the new contract asserts
    // the cell stays 1 and no history entry is pushed.
    it('is a no-op when the cell is already a wall (no toggle, no history, no dirty flip)', () => {
      // Arrange — start with all walls.
      useEditorStore.setState({
        level: makeMaze(),
        past: [],
        dirty: false,
      });
      // Act — (2,1) is already a wall in makeMaze.
      useEditorStore.getState().placeWall(2, 1);
      // Assert
      expect(useEditorStore.getState().level.walls[1]![2]).toBe(1);
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
    });

    // F-2026-06-12-T2-c: the editor must never let the user click "wall" on the
    // start or exit cell, because that immediately produces an
    // unsaveable level (`validateMaze` rejects "start is on a wall" /
    // "exit is on a wall"). Match the silent-reject idiom used by
    // `placeStart` on a wall, `addEnemyNode` OOB, etc. — no history
    // push, no dirty flip, walls unchanged.
    it('placeWall on the start cell is a no-op (no toggle, no history, no dirty flip)', () => {
      // Arrange — start (0,0) in makeMaze. Confirm it's currently a wall
      // in the default all-1 grid.
      useEditorStore.setState({ past: [], dirty: false });
      expect(useEditorStore.getState().level.walls[0]![0]).toBe(1);
      // Act
      useEditorStore.getState().placeWall(0, 0);
      // Assert — wall stays a wall, no history, no dirty.
      expect(useEditorStore.getState().level.walls[0]![0]).toBe(1);
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
    });

    it('placeWall on the exit cell is a no-op (no toggle, no history, no dirty flip)', () => {
      // Arrange — exit (4,3) in makeMaze. Confirm it's currently a wall.
      useEditorStore.setState({ past: [], dirty: false });
      expect(useEditorStore.getState().level.walls[3]![4]).toBe(1);
      // Act
      useEditorStore.getState().placeWall(4, 3);
      // Assert
      expect(useEditorStore.getState().level.walls[3]![4]).toBe(1);
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
    });

    // F-2026-06-12-H1: silent-reject is great for state but invisible to
    // the user. Surface the rejection via `lastError` so the toolbar can
    // show "无法在起点放置墙" and the click isn't a mystery.
    it('placeWall on the start cell sets lastErrorKey (UX feedback for the silent-reject)', () => {
      // Arrange
      useEditorStore.setState({ past: [], dirty: false, lastError: null, lastErrorKey: null });
      // Act
      useEditorStore.getState().placeWall(0, 0);
      // Assert
      const key = useEditorStore.getState().lastErrorKey;
      expect(key).toBeTypeOf('string');
      expect(key).toBe('editor.lastError.wallOnStart');
    });

    it('placeWall on the exit cell sets lastErrorKey', () => {
      // Arrange
      useEditorStore.setState({ past: [], dirty: false, lastError: null, lastErrorKey: null });
      // Act
      useEditorStore.getState().placeWall(4, 3);
      // Assert
      const key = useEditorStore.getState().lastErrorKey;
      expect(key).toBeTypeOf('string');
      expect(key).toBe('editor.lastError.wallOnExit');
    });

    it('placeWall on a regular floor cell clears any previous lastError', () => {
      // Arrange — pre-seed an error from a previous rejection.
      useEditorStore.setState({ past: [], dirty: false, lastError: 'previous error' });
      // Act — click a normal floor cell.
      useEditorStore.getState().placeWall(1, 0);
      // Assert
      expect(useEditorStore.getState().lastError).toBeNull();
    });

    it('clearLastError action resets lastError to null', () => {
      // Arrange
      useEditorStore.setState({ lastError: 'stale error' });
      // Act
      useEditorStore.getState().clearLastError();
      // Assert
      expect(useEditorStore.getState().lastError).toBeNull();
    });

    // F-project-review-2026-06-13-C-M10: placeStart OOB and placePickup OOB
    // are pinned elsewhere; placeWall OOB silently no-ops but had no
    // regression test. A future "throw on OOB" refactor would not be
    // caught. Mirror the placeStart/placePickup OOB contract: silent
    // no-op (no toggle, no history push, no dirty flip).
    it('placeWall on an out-of-bounds cell is a silent no-op (C-M10)', () => {
      // Arrange — width=5, depth=4; (99, -3) is OOB on both axes. Seed
      // history + dirty so a regression that incorrectly pushes history
      // or flips dirty would show up in the assertions.
      useEditorStore.setState({ past: [], dirty: false, lastError: null });
      const wallsBefore = useEditorStore.getState().level.walls;
      // Act
      useEditorStore.getState().placeWall(99, -3);
      // Assert — state is byte-identical to the pre-call state.
      expect(useEditorStore.getState().level.walls).toBe(wallsBefore);
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
      // lastError is unchanged: OOB is not a UX-facing rejection (no
      // user gesture would target an OOB cell in the editor — viewport
      // click coordinates are already clamped). Pinning null here
      // guards against a future "always set lastError" refactor.
      expect(useEditorStore.getState().lastError).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 5b. placeErase (P2-9 dedicated carve / erase tool)
  // -----------------------------------------------------------------------
  describe('placeErase', () => {
    // F-P2-9: dedicated carve tool. Inverse of placeWall: 1→0.
    it('sets walls[z][x] from 1→0, sets dirty, and pushes history', () => {
      // Arrange — start with a wall cell at (2,1).
      useEditorStore.setState({
        level: makeMaze(),
        past: [],
      });
      // Act
      useEditorStore.getState().placeErase(2, 1);
      // Assert
      expect(useEditorStore.getState().level.walls[1]![2]).toBe(0);
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('is a no-op when the cell is already floor (no toggle, no history, no dirty flip)', () => {
      // Arrange — start with (2,1) already a floor cell.
      useEditorStore.setState({
        level: makeMaze({
          walls: [
            [1, 1, 1, 1, 1],
            [1, 1, 0, 1, 1],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
          ],
        }),
        past: [],
        dirty: false,
      });
      // Act
      useEditorStore.getState().placeErase(2, 1);
      // Assert
      expect(useEditorStore.getState().level.walls[1]![2]).toBe(0);
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
    });

    it('placeErase on the start cell is a no-op and sets lastErrorKey', () => {
      // Use the default makeMaze fixture where start (0,0) sits on a
      // wall (walls[0][0] === 1) — placeErase must reject without
      // changing it.
      useEditorStore.setState({
        level: makeMaze(),
        past: [],
        dirty: false,
        lastError: null,
        lastErrorKey: null,
      });
      useEditorStore.getState().placeErase(0, 0);
      expect(useEditorStore.getState().level.walls[0]![0]).toBe(1); // start cell stays wall
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.eraseOnStart');
      expect(useEditorStore.getState().past.length).toBe(0);
    });

    it('placeErase on the exit cell is a no-op and sets lastErrorKey', () => {
      useEditorStore.setState({
        level: makeMaze(),
        past: [],
        dirty: false,
        lastError: null,
        lastErrorKey: null,
      });
      useEditorStore.getState().placeErase(4, 3);
      expect(useEditorStore.getState().level.walls[3]![4]).toBe(1); // exit cell stays wall
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.eraseOnExit');
      expect(useEditorStore.getState().past.length).toBe(0);
    });

    it('placeErase on an out-of-bounds cell is a silent no-op', () => {
      useEditorStore.setState({ past: [], dirty: false });
      const wallsBefore = useEditorStore.getState().level.walls;
      useEditorStore.getState().placeErase(99, -3);
      expect(useEditorStore.getState().level.walls).toBe(wallsBefore);
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 6. placeStart / placeExit
  // -----------------------------------------------------------------------
  describe('placeStart / placeExit', () => {
    it('placeStart on a floor cell updates start, sets dirty, pushes history', () => {
      // Arrange — start with (0,0) as a wall to make placement testable.
      useEditorStore.setState({
        level: makeMaze({
          start: { x: 0, z: 0 },
          walls: [
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
        }),
        past: [],
      });
      // Act
      useEditorStore.getState().placeStart(2, 2);
      // Assert
      expect(useEditorStore.getState().level.start).toEqual({ x: 2, z: 2, level: 0 });
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('placeStart on a wall cell auto-carves the wall and drops the start there', () => {
      // Arrange — (3,1) is a wall in the default all-1 grid.
      useEditorStore.setState({ past: [], dirty: false });
      // Act
      useEditorStore.getState().placeStart(3, 1);
      // Assert — start moves to (3,1) AND the wall is carved to floor.
      // UX win over the legacy silent-reject so the user isn't stuck
      // with "I clicked but nothing happened".
      expect(useEditorStore.getState().level.start).toEqual({ x: 3, z: 1, level: 0 });
      expect(useEditorStore.getState().level.walls[1]![3]).toBe(0);
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('placeStart out of bounds is rejected', () => {
      // Arrange
      useEditorStore.setState({ past: [], dirty: false });
      // Act
      useEditorStore.getState().placeStart(99, 99);
      // Assert
      expect(useEditorStore.getState().level.start).toEqual({ x: 0, z: 0, level: 0 });
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
    });

    it('placeExit on a floor cell updates exit, sets dirty, pushes history', () => {
      // Arrange — make every cell a floor first.
      useEditorStore.setState({
        level: makeMaze({
          walls: [
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
        }),
        past: [],
      });
      // Act
      useEditorStore.getState().placeExit(1, 1);
      // Assert
      expect(useEditorStore.getState().level.exit).toEqual({ x: 1, z: 1, level: 0 });
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // 7. placePickup
  // -----------------------------------------------------------------------
  describe('placePickup', () => {
    it('appends a pickup with a fresh id, type=time, value=10', () => {
      // Arrange
      useEditorStore.setState({
        level: makeMaze({
          walls: [
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
        }),
        past: [],
      });
      // Act
      useEditorStore.getState().placePickup(1, 1);
      // Assert
      const pickups = useEditorStore.getState().level.pickups;
      expect(pickups).toHaveLength(1);
      const p = pickups[0]!;
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.x).toBe(1);
      expect(p.z).toBe(1);
      expect(p.type).toBe('time');
      expect(p.value).toBe(10);
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('produces two different ids across two placePickup calls', () => {
      // Arrange — move start to (4,3) so (0,0) and (1,0) are valid pickup cells.
      useEditorStore.setState({
        level: makeMaze({
          start: { x: 4, z: 3 },
          walls: [
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
        }),
        past: [],
      });
      // Act
      useEditorStore.getState().placePickup(0, 0);
      useEditorStore.getState().placePickup(1, 0);
      // Assert
      const ids = useEditorStore.getState().level.pickups.map((p) => p.id);
      expect(ids).toHaveLength(2);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it('clears the selection after placing a pickup', () => {
      // Arrange — start at (4,3) so (1,1) is a valid (non-start) floor cell.
      useEditorStore.setState({
        level: makeMaze({
          start: { x: 4, z: 3 },
          walls: [
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
        }),
        past: [],
        selection: { kind: 'pickup', id: 'old' },
      });
      // Act
      useEditorStore.getState().placePickup(1, 1);
      // Assert
      expect(useEditorStore.getState().selection).toBeNull();
    });

    // F-P2-9: pickup-on-wall was a silent reject previously; the new
    // contract surfaces lastErrorKey so the toolbar chip can show
    // "拾取物只能放在地面上（请先用「通道」工具凿出地面再放拾取）".
    it('on a wall cell is a no-op and sets lastErrorKey (pickupOnWall)', () => {
      useEditorStore.setState({
        level: makeMaze(), // default all-walls grid
        past: [],
        dirty: false,
        lastError: null,
        lastErrorKey: null,
      });
      // (2,1) is a wall in the default grid.
      useEditorStore.getState().placePickup(2, 1);
      expect(useEditorStore.getState().level.pickups).toHaveLength(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.pickupOnWall');
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
    });

    // F-2026-06-16-M-2: same-cell duplicate placement used to silently
    // stack two pickups at the same (x, z); `validateMaze` then rejected
    // the level at save time with no hint about which save attempt was
    // the bad one. Mirror the wall/start/exit placement-actions contract
    // and surface `pickupDuplicate` so the user can react immediately.
    it('on a cell that already has a pickup is a no-op and sets lastErrorKey (pickupDuplicate)', () => {
      useEditorStore.setState({
        level: makeMaze({
          walls: [
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
          pickups: [{ id: 'p-existing', x: 2, z: 2, type: 'time', value: 10 }],
        }),
        past: [],
        dirty: false,
        lastError: null,
        lastErrorKey: null,
      });
      useEditorStore.getState().placePickup(2, 2);
      expect(useEditorStore.getState().level.pickups).toHaveLength(1);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.pickupDuplicate');
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 8. placeEnemy
  // -----------------------------------------------------------------------
  describe('placeEnemy', () => {
    it('appends an enemy with a default 2-node path on a non-edge cell', () => {
      // Arrange
      useEditorStore.setState({ past: [] });
      // Act — (1, 1) is a non-edge, non-start, non-exit cell so the
      // new F-2026-06-18 occupancy guard accepts the click and the
      // second seed node (x+1 = 2) is in-bounds.
      useEditorStore.getState().placeEnemy(1, 1, 5);
      // Assert
      const enemies = useEditorStore.getState().level.enemies;
      expect(enemies).toHaveLength(1);
      const e = enemies[0]!;
      expect(e.id.length).toBeGreaterThan(0);
      expect(e.x).toBe(1);
      expect(e.z).toBe(1);
      expect(e.path).toEqual([
        { x: 1, z: 1 },
        { x: 2, z: 1 },
      ]);
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('falls back to (x-1) for the second seed node at the right edge so the two nodes never coincide', () => {
      // Arrange
      useEditorStore.setState({ past: [] });
      // Act — width=5, x=4 is the last column; x+1 would land out of
      // bounds. The store falls back to x-1 instead of clamping to x,
      // so the seed path has two distinct nodes (a degenerate
      // zero-length segment would break SVG marker-end orientation
      // and confuse enemy AI patrol code).
      useEditorStore.getState().placeEnemy(4, 0, 5);
      // Assert — second node falls back to (3, 0).
      const e = useEditorStore.getState().level.enemies[0]!;
      expect(e.path).toEqual([
        { x: 4, z: 0 },
        { x: 3, z: 0 },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // 8b. appendEnemyPathNode — covered separately because the click-to-extend
  // path interaction (EditorViewport handleCellClick) routes through this
  // action when an enemy is already selected.
  // -----------------------------------------------------------------------
  describe('appendEnemyPathNode', () => {
    it('appends a new path node and auto-carves a wall under it', () => {
      // Arrange — fresh enemy whose path ends at (2, 1) after the
      // placeEnemy(1, 1, 5) default seed.
      useEditorStore.setState({ past: [] });
      useEditorStore.getState().placeEnemy(1, 1, 5);
      const enemyId = useEditorStore.getState().level.enemies[0]!.id;
      // Force (3, 1) to be a wall so we can confirm carve-on-append.
      const lvl = useEditorStore.getState().level;
      const walls = lvl.walls.map((r) => r.slice());
      walls[1]![3] = 1;
      useEditorStore.setState({ level: { ...lvl, walls } });
      // Act
      useEditorStore.getState().appendEnemyPathNode(enemyId, 3, 1);
      // Assert — node appended, wall carved.
      const next = useEditorStore.getState().level;
      expect(next.enemies[0]!.path).toEqual([
        { x: 1, z: 1 },
        { x: 2, z: 1 },
        { x: 3, z: 1 },
      ]);
      expect(next.walls[1]![3]).toBe(0);
      expect(useEditorStore.getState().lastError).toBeNull();
    });

    it('rejects duplicate appends (no-op when new node === last node)', () => {
      // Arrange
      useEditorStore.setState({ past: [] });
      useEditorStore.getState().placeEnemy(1, 1, 5);
      const enemyId = useEditorStore.getState().level.enemies[0]!.id;
      const beforePath = useEditorStore.getState().level.enemies[0]!.path;
      // Act — click the already-last cell again. Last is (2, 1).
      useEditorStore.getState().appendEnemyPathNode(enemyId, 2, 1);
      // Assert — path unchanged. Without this guard the polyline would
      // contain a zero-length segment, breaking SVG marker orientation
      // and the enemy patrol AI's "advance to next node" loop.
      const afterPath = useEditorStore.getState().level.enemies[0]!.path;
      expect(afterPath).toEqual(beforePath);
    });

    it('records lastError and skips the append when the click is out of bounds', () => {
      useEditorStore.setState({ past: [], lastError: null });
      useEditorStore.getState().placeEnemy(1, 1, 5);
      const enemyId = useEditorStore.getState().level.enemies[0]!.id;
      useEditorStore.getState().appendEnemyPathNode(enemyId, 99, 99);
      expect(useEditorStore.getState().level.enemies[0]!.path).toHaveLength(2);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.pathOutOfBounds');
    });

    // F-2026-06-18: clicking a diagonal cell was accepted previously,
    // producing a 斜着 drawn path in the screenshot. The runtime enemy
    // walks node[i] → node[i+1] in a single tick, so a diagonal link
    // would teleport the marker through a cell the player can step
    // into. The new guard rejects the click + surfaces
    // `pathNotAdjacent` so the toolbar chip tells the user what's
    // wrong.
    it('rejects diagonal appends (must be 4-adjacent to the last node)', () => {
      useEditorStore.setState({ past: [], lastError: null, lastErrorKey: null });
      useEditorStore.getState().placeEnemy(1, 1, 5);
      const enemyId = useEditorStore.getState().level.enemies[0]!.id;
      // Path currently ends at (2, 1). Try to add (3, 0) — diagonal, illegal.
      useEditorStore.getState().appendEnemyPathNode(enemyId, 3, 0);
      expect(useEditorStore.getState().level.enemies[0]!.path).toEqual([
        { x: 1, z: 1 },
        { x: 2, z: 1 },
      ]);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.pathNotAdjacent');
    });

    it('accepts cardinal (up/down/left/right) appends', () => {
      useEditorStore.setState({ past: [], lastError: null, lastErrorKey: null });
      useEditorStore.getState().placeEnemy(1, 1, 5);
      const enemyId = useEditorStore.getState().level.enemies[0]!.id;
      // Walk right, then down, then left — all 4-adjacent, all should land.
      useEditorStore.getState().appendEnemyPathNode(enemyId, 3, 1);
      useEditorStore.getState().appendEnemyPathNode(enemyId, 3, 2);
      useEditorStore.getState().appendEnemyPathNode(enemyId, 2, 2);
      expect(useEditorStore.getState().level.enemies[0]!.path).toEqual([
        { x: 1, z: 1 },
        { x: 2, z: 1 },
        { x: 3, z: 1 },
        { x: 3, z: 2 },
        { x: 2, z: 2 },
      ]);
      expect(useEditorStore.getState().lastError).toBeNull();
      expect(useEditorStore.getState().lastErrorKey).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 8c. commitEnemyPath — guards the panel-input "commit on blur" path
  // against hand-typed diagonal coordinates (or any future auto-snap
  // feature that lands nodes off-grid). Mirrors the viewport click
  // guard above so the same adjacency invariant holds regardless of
  // how the user enters the coordinates.
  // -----------------------------------------------------------------------
  describe('commitEnemyPath', () => {
it('refuses to commit and surfaces pathNotAdjacent when any segment is diagonal', () => {
      // Arrange — placeEnemy itself pushes one snapshot onto `past`;
      // clear it so we can assert that commitEnemyPath is the only
      // possible pusher for the rest of the test. Then mutate the
      // store directly to plant a diagonal segment (we can't reach
      // this state through the public API any more — the guard
      // below is what makes it impossible).
      useEditorStore.setState({ past: [], lastError: null, lastErrorKey: null });
      useEditorStore.getState().placeEnemy(1, 1, 5);
      useEditorStore.setState({ past: [] });
      const enemy = useEditorStore.getState().level.enemies[0]!;
      useEditorStore.setState({
        level: {
          ...useEditorStore.getState().level,
          enemies: [
            // path[0]=(1,1), path[1]=(2,1), path[2]=(3,0) — (2,1)→(3,0)
            // is a diagonal hop, which commitEnemyPath must reject.
            { ...enemy, path: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 0 }] },
          ],
        },
      });
      // Act
      useEditorStore.getState().commitEnemyPath();
      // Assert — no history snapshot was pushed; error key set.
      expect(useEditorStore.getState().past).toHaveLength(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.pathNotAdjacent');
    });

    it('commits normally when every segment is 4-adjacent', () => {
      useEditorStore.setState({ past: [], lastError: null, lastErrorKey: null });
      useEditorStore.getState().placeEnemy(1, 1, 5);
      // placeEnemy pushed one snapshot; clear so the test asserts the
      // count commitEnemyPath alone produces.
      useEditorStore.setState({ past: [] });
      // Existing path is (1,1) → (2,1) — already 4-adjacent, commit
      // should push exactly one snapshot without erroring.
      useEditorStore.getState().commitEnemyPath();
      expect(useEditorStore.getState().past).toHaveLength(1);
      expect(useEditorStore.getState().lastError).toBeNull();
      expect(useEditorStore.getState().lastErrorKey).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 8d. F-2026-06-18: every editor element (start, exit, pickup, every
  // enemy-path node) occupies exactly one cell. The store must reject
  // overlapping placements at click time so the toolbar chip tells the
  // user *what* the click collided with — instead of validateMaze
  // refusing the saved level with a generic "collision" error and the
  // user having to hunt for the offender.
  // -----------------------------------------------------------------------
  describe('placement collisions (no two elements share a cell)', () => {
    it('rejects placeWall on a pickup cell with collideWithPickup', () => {
      useEditorStore.setState({ past: [], lastError: null, lastErrorKey: null });
      // Carve (2, 1) so the pickup can land there (pickup on wall is
      // rejected by a different guard, before the new collision check
      // could be exercised).
      useEditorStore.getState().placeErase(2, 1);
      useEditorStore.getState().placePickup(2, 1);
      // Sanity: pickup actually placed.
      expect(useEditorStore.getState().level.pickups).toHaveLength(1);
      // Act — try to drop a wall on the same cell.
      useEditorStore.getState().placeWall(2, 1);
      // Assert — wall not placed, error key set to collideWithPickup.
      expect(useEditorStore.getState().level.walls[1]![2]).toBe(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.collideWithPickup');
    });

    it('rejects placePickup on an enemy spawn cell with collideWithEnemy', () => {
      useEditorStore.setState({ past: [], lastError: null, lastErrorKey: null });
      useEditorStore.getState().placeEnemy(2, 1, 5);
      // Act — try to drop a pickup on the enemy spawn.
      useEditorStore.getState().placePickup(2, 1);
      // Assert — pickup not added, error key set.
      expect(useEditorStore.getState().level.pickups).toHaveLength(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.collideWithEnemy');
    });

    it('rejects placeEnemy on the start cell with collideWithStart', () => {
      useEditorStore.setState({ past: [], lastError: null, lastErrorKey: null });
      // placeEnemy at (0, 0) is the default start cell.
      useEditorStore.getState().placeEnemy(0, 0, 5);
      expect(useEditorStore.getState().level.enemies).toHaveLength(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.collideWithStart');
    });

    it('rejects placeStart on a pickup cell with collideWithPickup', () => {
      useEditorStore.setState({ past: [], lastError: null, lastErrorKey: null });
      useEditorStore.getState().placeErase(1, 1);
      useEditorStore.getState().placePickup(1, 1);
      // Act — move start to (1, 1).
      useEditorStore.getState().placeStart(1, 1);
      // Assert — start was not moved (default grid keeps start at (0, 0)).
      expect(useEditorStore.getState().level.start).toEqual({ x: 0, z: 0, level: 0 });
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.collideWithPickup');
    });

    it('rejects appendEnemyPathNode into a cell that holds a pickup', () => {
      useEditorStore.setState({ past: [], lastError: null, lastErrorKey: null });
      useEditorStore.getState().placeEnemy(1, 1, 5);
      const enemyId = useEditorStore.getState().level.enemies[0]!.id;
      // The enemy path ends at (2, 1). Plant a pickup at (2, 2),
      // which is 4-adjacent to (2, 1) — adjacent check passes, so
      // the F-2026-06-18 occupancy guard is the one that must fire.
      useEditorStore.getState().placeErase(2, 2);
      useEditorStore.getState().placePickup(2, 2);
      useEditorStore.getState().appendEnemyPathNode(enemyId, 2, 2);
      // Path unchanged (still 2 nodes), collision key surfaced.
      expect(useEditorStore.getState().level.enemies[0]!.path).toHaveLength(2);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.collideWithPickup');
    });
  });

  // -----------------------------------------------------------------------
  // 9. updatePickup / updateEnemy / updateRule / updateName / updateSize
  // -----------------------------------------------------------------------
  describe('update* family', () => {
    it('updatePickup patches the matching pickup and marks dirty', () => {
      // Arrange
      const p: Pickup = { id: 'p1', x: 1, z: 1, type: 'time', value: 10 };
      useEditorStore.setState({
        level: makeMaze({ pickups: [p] }),
        past: [],
      });
      // Act
      useEditorStore.getState().updatePickup('p1', { type: 'health', value: 2 });
      // Assert
      const updated = useEditorStore.getState().level.pickups[0]!;
      expect(updated.type).toBe('health');
      expect(updated.value).toBe(2);
      // Untouched fields preserved.
      expect(updated.x).toBe(1);
      expect(updated.z).toBe(1);
      expect(updated.id).toBe('p1');
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('updateEnemy patches the matching enemy and marks dirty', () => {
      // Arrange
      const e: EnemySpawn = {
        id: 'e1',
        x: 0,
        z: 0,
        path: [
          { x: 0, z: 0 },
          { x: 1, z: 0 },
        ],
      };
      useEditorStore.setState({
        level: makeMaze({ enemies: [e] }),
        past: [],
      });
      // Act
      useEditorStore.getState().updateEnemy('e1', { dwellTime: 0.5, fovRange: 8 });
      // Assert
      const updated = useEditorStore.getState().level.enemies[0]!;
      expect(updated.dwellTime).toBe(0.5);
      expect(updated.fovRange).toBe(8);
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('updateRule merges into the existing rules', () => {
      // Arrange
      useEditorStore.setState({ past: [] });
      // Act
      useEditorStore.getState().updateRule({ initialTime: 120 });
      // Assert
      const r: LevelRules = useEditorStore.getState().level.rules;
      expect(r.initialTime).toBe(120);
      // Untouched fields preserved.
      expect(r.maxHealth).toBe(3);
      expect(r.victory).toBe('reach-exit');
      expect(r.timeOnPickup).toBe(10);
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('updateName updates the name and marks dirty', () => {
      // Arrange
      useEditorStore.setState({ past: [] });
      // Act
      useEditorStore.getState().updateName('My New Level');
      // Assert
      expect(useEditorStore.getState().level.name).toBe('My New Level');
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('updateSize regenerates walls (1 except for the clamped start/exit cells) and clamps start/exit when out of bounds', () => {
      // Arrange — start at (0,0), exit at (4,3); resize to 3x3 (so exit is out of bounds).
      useEditorStore.setState({ past: [] });
      // Act
      useEditorStore.getState().updateSize(3, 3);
      // Assert
      const lvl = useEditorStore.getState().level;
      expect(lvl.size).toEqual({ width: 3, depth: 3 });
      expect(lvl.walls).toHaveLength(3);
      // F-2026-06-17: a resize rebuilds the grid as an empty open floor
      // (all 0s), matching the new buildEmptyLevel behavior. Anything the
      // user had placed before is dropped — OOB walls from the previous
      // size never silently re-appear.
      for (let z = 0; z < lvl.walls.length; z += 1) {
        for (let x = 0; x < lvl.walls[z]!.length; x += 1) {
          expect(lvl.walls[z]![x]).toBe(0);
        }
      }
      // Exit (4,3) → (2,2) after clamp.
      expect(lvl.exit).toEqual({ x: 2, z: 2, level: 0 });
      // Start stays in bounds.
      expect(lvl.start).toEqual({ x: 0, z: 0, level: 0 });
    });

    // F-2026-06-12-T2-d: a resize to a grid that keeps start/exit in bounds should
    // also leave the level structurally valid. Without the carve fix the
    // resized grid is all-1s with start/exit on walls, so `validateMaze`
    // throws "start is on a wall" / "exit is on a wall".
    it('updateSize produces a level that passes validateMaze (resize keeps start/exit in bounds)', () => {
      // Arrange — start at (0,0), exit at (4,3); resize up to 8x6.
      useEditorStore.setState({ past: [] });
      // Act
      useEditorStore.getState().updateSize(8, 6);
      // Assert
      const lvl = useEditorStore.getState().level;
      expect(() => validateMaze(lvl, lvl.id)).not.toThrow();
    });

    // F-2026-06-12-H3: regression test for the 1×1 corner case. The
    // generator must not crash on width=1/depth=1 (no off-by-one when
    // allocating the 1×1 grid) and must produce a level where the only
    // cell is a floor. start and exit collapse to the same cell because
    // there is nowhere else to go; the level is intentionally not
    // saveable through `validateMaze` (which requires start ≠ exit), and
    // the toolbar surfaces that as an explicit error.
    it('updateSize(1, 1) does not crash and produces a single floor cell (start=exit=origin)', () => {
      // Arrange
      useEditorStore.setState({ past: [] });
      // Act
      useEditorStore.getState().updateSize(1, 1);
      // Assert
      const lvl = useEditorStore.getState().level;
      expect(lvl.size).toEqual({ width: 1, depth: 1 });
      expect(lvl.walls).toEqual([[0]]);
      expect(lvl.start).toEqual({ x: 0, z: 0, level: 0 });
      expect(lvl.exit).toEqual({ x: 0, z: 0, level: 0 });
    });
  });

  // -----------------------------------------------------------------------
  // 10. moveEnemyNode / addEnemyNode / removeEnemyNode
  // -----------------------------------------------------------------------
  describe('enemy path node edits', () => {
    function withEnemy(): void {
      const e: EnemySpawn = {
        id: 'e1',
        x: 0,
        z: 0,
        path: [
          { x: 0, z: 0 },
          { x: 2, z: 1 },
        ],
      };
      useEditorStore.setState({ level: makeMaze({ enemies: [e] }) });
    }

    it('moveEnemyNode clamps x to [0, width-1]', () => {
      // Arrange
      withEnemy();
      // Act
      useEditorStore.getState().moveEnemyNode('e1', 0, 99, 0);
      // Assert — width is 5, so 99 → 4.
      expect(useEditorStore.getState().level.enemies[0]!.path[0]).toEqual({ x: 4, z: 0 });
    });

    it('moveEnemyNode clamps z to [0, depth-1]', () => {
      // Arrange
      withEnemy();
      // Act
      useEditorStore.getState().moveEnemyNode('e1', 0, 0, -3);
      // Assert — depth is 4, so -3 → 0.
      expect(useEditorStore.getState().level.enemies[0]!.path[0]).toEqual({ x: 0, z: 0 });
    });

    it('addEnemyNode appends a new node to the end of the path', () => {
      // Arrange
      withEnemy();
      // Act
      useEditorStore.getState().addEnemyNode('e1', 3, 3);
      // Assert
      const path = useEditorStore.getState().level.enemies[0]!.path;
      expect(path).toHaveLength(3);
      expect(path[2]).toEqual({ x: 3, z: 3 });
    });

    it('addEnemyNode silently no-ops when the requested node is out of bounds (F7 guard)', () => {
      // Regression (F7): the editor's `addEnemyNode` previously pushed
      // any (x, z) onto the path verbatim, so a patrol node with
      // x>=width or z>=depth or negative coords slipped into the
      // saved level. `validateMaze` (post-F7) now rejects the saved
      // JSON, but matching `removeEnemyNode` (line 432-440) and
      // `placeWall` etc. with a silent-reject in the editor keeps the
      // store from holding an obviously-invalid state between edits.
      // Arrange — width=5, depth=4, so (99, -3) is OOB on both axes.
      withEnemy();
      // Act
      useEditorStore.getState().addEnemyNode('e1', 99, -3);
      // Assert — path unchanged from the original 2 nodes.
      const path = useEditorStore.getState().level.enemies[0]!.path;
      expect(path).toHaveLength(2);
    });

    it('removeEnemyNode silently no-ops when only 2 nodes remain (cannot go below 2)', () => {
      // Arrange — path is exactly 2 nodes.
      withEnemy();
      // Act — must not throw, matching the silent-reject idiom used by
      // placeWall / placeStart / placePickup when the action would
      // produce an invalid state.
      useEditorStore.getState().removeEnemyNode('e1', 0);
      // Assert — path untouched, no history push, no dirty flip.
      expect(useEditorStore.getState().level.enemies[0]!.path).toHaveLength(2);
      expect(useEditorStore.getState().past).toEqual([]);
      expect(useEditorStore.getState().dirty).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 11. deleteSelected
  // -----------------------------------------------------------------------
  describe('deleteSelected', () => {
    it('removes the matching pickup when selection.kind = "pickup"', () => {
      // Arrange
      const p: Pickup = { id: 'p1', x: 0, z: 0, type: 'time', value: 10 };
      useEditorStore.setState({
        level: makeMaze({
          pickups: [p],
          walls: [
            [0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
          ],
        }),
        selection: { kind: 'pickup', id: 'p1' },
        past: [],
      });
      // Act
      useEditorStore.getState().deleteSelected();
      // Assert
      expect(useEditorStore.getState().level.pickups).toEqual([]);
      expect(useEditorStore.getState().past.length).toBe(1);
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('removes the matching enemy when selection.kind = "enemy"', () => {
      // Arrange
      const e: EnemySpawn = {
        id: 'e1',
        x: 0,
        z: 0,
        path: [
          { x: 0, z: 0 },
          { x: 1, z: 0 },
        ],
      };
      useEditorStore.setState({
        level: makeMaze({ enemies: [e] }),
        selection: { kind: 'enemy', id: 'e1' },
        past: [],
      });
      // Act
      useEditorStore.getState().deleteSelected();
      // Assert
      expect(useEditorStore.getState().level.enemies).toEqual([]);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('carves the selected wall back to floor (sets walls[z][x]=0) when selection.kind = "wall"', () => {
      // Arrange — (2,1) is a wall, selected for deletion. The select
      // tool only arms kind === 'wall' on a wall cell, so the branch
      // must flip 1 → 0 (not 1 → 1 which would make the panel's
      // "删除墙体" button a silent no-op — see editorStore.ts F-2026-06-18).
      const walls: CellType[][] = [
        [0, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ];
      useEditorStore.setState({
        level: makeMaze({ walls }),
        selection: { kind: 'wall', x: 2, z: 1 },
        past: [],
      });
      // Act
      useEditorStore.getState().deleteSelected();
      // Assert — that one cell is carved; every other cell is untouched.
      expect(useEditorStore.getState().level.walls[1]![2]).toBe(0);
      expect(useEditorStore.getState().level.walls[0]![1]).toBe(1);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('is a no-op when selection is null', () => {
      // Arrange — no selection, no history.
      useEditorStore.setState({
        level: makeMaze({
          walls: [
            [0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
          ],
        }),
        selection: null,
        past: [],
        dirty: false,
      });
      // Act
      useEditorStore.getState().deleteSelected();
      // Assert
      expect(useEditorStore.getState().level.walls[0]![0]).toBe(0);
      expect(useEditorStore.getState().past).toEqual([]);
      expect(useEditorStore.getState().dirty).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 12. undo / redo
  // -----------------------------------------------------------------------
  describe('undo / redo', () => {
    // F-P2-9: placeWall is set-to-1 (no toggle). Tests now use a
    // floor cell as the starting state so placeWall produces a real
    // change (0 → 1) that undo can roll back.
    function floorMaze(): ReturnType<typeof makeMaze> {
      return makeMaze({
        walls: [
          [1, 0, 1, 1, 1],
          [1, 1, 1, 1, 1],
          [1, 1, 1, 1, 1],
          [1, 1, 1, 1, 1],
        ],
      });
    }

    it('undo restores the previous wall state after placeWall', () => {
      // Arrange — (1,0) starts as floor (0).
      useEditorStore.setState({
        level: floorMaze(),
        past: [],
      });
      useEditorStore.getState().placeWall(1, 0);
      expect(useEditorStore.getState().level.walls[0]![1]).toBe(1);
      // Act
      useEditorStore.getState().undo();
      // Assert
      expect(useEditorStore.getState().level.walls[0]![1]).toBe(0);
    });

    it('redo replays the undone action', () => {
      useEditorStore.setState({
        level: floorMaze(),
        past: [],
      });
      useEditorStore.getState().placeWall(1, 0);
      useEditorStore.getState().undo();
      // Act
      useEditorStore.getState().redo();
      // Assert
      expect(useEditorStore.getState().level.walls[0]![1]).toBe(1);
    });

    // F-2026-06-12-B2: dirty is no longer a monotonic boolean — it is
    // derived from `levelHash(current) !== lastSavedHash`. After the
    // user undoes back to the saved state, dirty must be false (matches
    // the last-saved snapshot), not the unconditional `true` the
    // previous implementation forced.
    it('undo back to the saved state clears dirty (state matches last-saved hash)', () => {
      const baseline = floorMaze();
      const baselineHash = JSON.stringify(baseline);
      useEditorStore.setState({
        level: baseline,
        past: [],
        dirty: false,
        lastSavedHash: baselineHash,
      });
      useEditorStore.getState().placeWall(1, 0);
      expect(useEditorStore.getState().dirty).toBe(true);
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().level).toEqual(baseline);
      expect(useEditorStore.getState().dirty).toBe(false);
    });

    it('redo from the saved state restores dirty=true (state diverges again)', () => {
      const baseline = floorMaze();
      useEditorStore.setState({
        level: baseline,
        past: [],
        dirty: false,
        lastSavedHash: JSON.stringify(baseline),
      });
      useEditorStore.getState().placeWall(1, 0);
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().dirty).toBe(false);
      useEditorStore.getState().redo();
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('a new push after undo clears the future stack (branch is cut)', () => {
      // Use a maze where (0,0), (1,0), (2,0) are all floor so each
      // placeWall is a real edit (not a no-op on already-wall).
      useEditorStore.setState({
        level: makeMaze({
          walls: [
            [0, 0, 0, 1, 1],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
          ],
        }),
        past: [],
      });
      useEditorStore.getState().placeWall(0, 0);
      useEditorStore.getState().placeWall(1, 0);
      useEditorStore.getState().undo();
      const futureLen = useEditorStore.getState().future.length;
      expect(futureLen).toBeGreaterThan(0);
      useEditorStore.getState().placeWall(2, 0);
      expect(useEditorStore.getState().future).toEqual([]);
    });

    it('canUndo / canRedo reflect the current history state', () => {
      useEditorStore.setState({ level: floorMaze(), past: [] });
      expect(useEditorStore.getState().canUndo()).toBe(false);
      expect(useEditorStore.getState().canRedo()).toBe(false);
      useEditorStore.getState().placeWall(1, 0);
      expect(useEditorStore.getState().canUndo()).toBe(true);
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().canRedo()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 13. saveDraft / loadDraft
  // -----------------------------------------------------------------------
  describe('saveDraft / loadDraft', () => {
    it('saveDraft writes the level to localStorage under the documented key', () => {
      // Arrange
      const lvl = makeMaze({ id: 'custom-draft', name: 'draft' });
      useEditorStore.setState({ level: lvl });
      // Act
      useEditorStore.getState().saveDraft();
      // Assert
      const raw = localStorage.getItem(DRAFT_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.level).toEqual(lvl);
    });

    it('loadDraft reads the level back, replacing the current level', () => {
      // Arrange — start must be on a floor cell for the validateMaze gate.
      const lvl = makeMaze({
        id: 'custom-draft2',
        name: 'draft2',
        walls: [
          [0, 0, 0, 0, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
        ],
      });
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ level: lvl }));
      // Act
      useEditorStore.getState().loadDraft();
      // Assert
      expect(useEditorStore.getState().level).toEqual(lvl);
    });
  });

  // -----------------------------------------------------------------------
  // 14. importJson / exportJson
  // -----------------------------------------------------------------------
  describe('importJson / exportJson', () => {
    it('exportJson returns the level wrapped via importExport', () => {
      // Arrange
      const lvl = makeMaze({ id: 'custom-export', name: 'export' });
      useEditorStore.setState({ level: lvl });
      // Act
      const out = useEditorStore.getState().exportJson();
      // Assert
      const parsed = JSON.parse(out);
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.level).toEqual(lvl);
    });

    it('importJson replaces the level, resets id to a fresh custom-<uuid>, preserves the name, resets history', () => {
      // Arrange — craft a valid envelope for an external level (start on a floor).
      const external = makeMaze({
        id: 'external-1',
        name: 'My Cool Level',
        walls: [
          [0, 0, 0, 0, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
          [1, 1, 1, 1, 0],
        ],
      });
      const envelope = { schemaVersion: 1, level: external };
      const raw = JSON.stringify(envelope);
      const originalName = external.name;
      // Act
      useEditorStore.getState().importJson(raw);
      // Assert
      const lvl = useEditorStore.getState().level;
      expect(lvl.id).not.toBe('external-1');
      expect(lvl.id.startsWith('custom-')).toBe(true);
      expect(lvl.name).toBe(originalName);
      expect(useEditorStore.getState().past).toEqual([]);
      expect(useEditorStore.getState().future).toEqual([]);
      expect(useEditorStore.getState().dirty).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 15. integration
  // -----------------------------------------------------------------------
  describe('integration', () => {
    it('full flow: newLevel → placeWall → placeStart → placePickup → saveLevel → loadDraft', () => {
      // Arrange / Act
      useEditorStore.getState().newLevel(5, 4);
      // Carve a path and put start/exit on floor cells.
      useEditorStore.setState({
        level: {
          ...useEditorStore.getState().level,
          walls: [
            [0, 0, 0, 0, 0],
            [1, 1, 1, 1, 0],
            [0, 0, 0, 0, 0],
            [0, 1, 1, 1, 0],
          ],
        },
      });
      useEditorStore.getState().placeStart(0, 0);
      useEditorStore.getState().placePickup(1, 0);
      useEditorStore.getState().saveLevel();
      useEditorStore.getState().saveDraft();

      // Wipe and restore via loadDraft.
      useEditorStore.setState({ level: makeMaze() });
      useEditorStore.getState().loadDraft();

      // Assert
      const lvl = useEditorStore.getState().level;
      expect(lvl.size).toEqual({ width: 5, depth: 4 });
      expect(lvl.start).toEqual({ x: 0, z: 0, level: 0 });
      expect(lvl.pickups).toHaveLength(1);
      expect(lvl.pickups[0]!.x).toBe(1);
      expect(lvl.pickups[0]!.z).toBe(0);
    });
  });

  // F-2026-06-30: P2-16 — three new parchment patch actions. Each
  // delegates to updateRule under the hood, so the dirty-marking +
  // history contract is the same as every other rule edit. The
  // tests pin only the field-specific behavior; the generic dirty
  // contract is covered by the existing updateRule block.
  describe('P2-16 — parchment patch actions', () => {
    // F-2026-06-30: P2-16 — minimal level factory for the new tests.
    // Mirrors `newLevel(5, 4)` from the store but with no enemy
    // injection / no `dirty` reset; the `dirty: false` reset comes
    // from the surrounding setState so the test's contract reads
    // top-to-bottom.
    function freshLevel(): MazeData {
      return {
        id: 'parchment-test',
        name: 'Parchment Test',
        size: { width: 5, depth: 4 },
        cellSize: 2,
        start: { x: 0, z: 0 },
        exit: { x: 4, z: 3 },
        walls: [
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
        pickups: [],
        enemies: [],
        traps: [],
        doors: [],
        rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
      };
    }

    it('updateMinimapMode writes to rules.minimapMode and marks dirty', () => {
      // Arrange — fresh level, baseline (no minimapMode)
      useEditorStore.setState({ level: freshLevel(), dirty: false });
      const beforeDirty = useEditorStore.getState().dirty;

      // Act
      useEditorStore.getState().updateMinimapMode('parchment');

      // Assert
      const lvl = useEditorStore.getState().level;
      expect(lvl.rules.minimapMode).toBe('parchment');
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().dirty).not.toBe(beforeDirty);
    });

    it('updateMapOpenBehavior writes to rules.mapOpenBehavior', () => {
      useEditorStore.setState({ level: freshLevel(), dirty: false });
      useEditorStore.getState().updateMapOpenBehavior('continue');
      expect(useEditorStore.getState().level.rules.mapOpenBehavior).toBe('continue');
    });

    it('updateParchmentLifecycle writes to rules.parchmentLifecycle', () => {
      useEditorStore.setState({ level: freshLevel(), dirty: false });
      useEditorStore.getState().updateParchmentLifecycle('persist');
      expect(useEditorStore.getState().level.rules.parchmentLifecycle).toBe('persist');
    });

    it('updateMinimapMode rejects unknown values silently', () => {
      // F-2026-06-30: P2-16 — type guard at the store boundary. A
      // hand-rolled caller passing a string literal that doesn't
      // match the union must NOT poison the level rules.
      useEditorStore.setState({ level: freshLevel(), dirty: false });
      // The action signature is typed as MinimapMode, so the
      // runtime guard only matters for callers bypassing TS (e.g.
      // dynamic JSON). Cast through unknown to simulate.
      useEditorStore
        .getState()
        .updateMinimapMode('parchments' as unknown as 'parchment');
      expect(useEditorStore.getState().level.rules.minimapMode).toBeUndefined();
      // No write → no dirty flip.
      expect(useEditorStore.getState().dirty).toBe(false);
    });

    it('updateMapOpenBehavior rejects unknown values silently', () => {
      useEditorStore.setState({ level: freshLevel(), dirty: false });
      useEditorStore
        .getState()
        .updateMapOpenBehavior('play' as unknown as 'continue');
      expect(useEditorStore.getState().level.rules.mapOpenBehavior).toBeUndefined();
    });

    it('updateParchmentLifecycle rejects unknown values silently', () => {
      useEditorStore.setState({ level: freshLevel(), dirty: false });
      useEditorStore
        .getState()
        .updateParchmentLifecycle('keep' as unknown as 'persist');
      expect(useEditorStore.getState().level.rules.parchmentLifecycle).toBeUndefined();
    });
  });

  // ── P2-18: trap + door actions ──
  describe('P2-18 — placeTrap', () => {
    // Fixture with floor cells at (1,1) and (2,1) for trap placement.
    const mazeWithFloor = makeMaze({
      walls: [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ],
    });

    it('appends a trap with default kind=fire, damage=1', () => {
      useEditorStore.setState({ level: mazeWithFloor, dirty: false });
      useEditorStore.getState().placeTrap(1, 1);
      const lvl = useEditorStore.getState().level;
      expect(lvl.traps).toHaveLength(1);
      expect(lvl.traps[0].kind).toBe('fire');
      expect(lvl.traps[0].damage).toBe(1);
      expect(lvl.traps[0].x).toBe(1);
      expect(lvl.traps[0].z).toBe(1);
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('is a no-op on a wall cell and sets lastErrorKey (trapOnWall)', () => {
      useEditorStore.setState({ level: mazeWithFloor, dirty: false });
      useEditorStore.getState().placeTrap(0, 0);
      expect(useEditorStore.getState().level.traps).toHaveLength(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.trapOnWall');
    });

    it('is a no-op on the start cell', () => {
      const maze = makeMaze({
        walls: [
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
      });
      useEditorStore.setState({ level: maze, dirty: false });
      useEditorStore.getState().placeTrap(0, 0);
      expect(useEditorStore.getState().level.traps).toHaveLength(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.collideWithStart');
    });

    it('is a no-op when a trap already exists on that cell', () => {
      useEditorStore.setState({ level: mazeWithFloor, dirty: false });
      useEditorStore.getState().placeTrap(1, 1);
      useEditorStore.getState().placeTrap(1, 1);
      expect(useEditorStore.getState().level.traps).toHaveLength(1);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.trapDuplicate');
    });
  });

  describe('P2-18 — placeDoor', () => {
    const mazeWithFloor = makeMaze({
      walls: [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ],
    });

    it('appends a door with default keyColor=red', () => {
      useEditorStore.setState({ level: mazeWithFloor, dirty: false });
      useEditorStore.getState().placeDoor(1, 1);
      const lvl = useEditorStore.getState().level;
      expect(lvl.doors).toHaveLength(1);
      expect(lvl.doors[0].keyColor).toBe('red');
      expect(lvl.doors[0].x).toBe(1);
      expect(lvl.doors[0].z).toBe(1);
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('is a no-op on a wall cell and sets lastErrorKey (doorOnWall)', () => {
      useEditorStore.setState({ level: mazeWithFloor, dirty: false });
      useEditorStore.getState().placeDoor(0, 0);
      expect(useEditorStore.getState().level.doors).toHaveLength(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.doorOnWall');
    });

    it('is a no-op on the exit cell', () => {
      const maze = makeMaze({
        walls: [
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
      });
      useEditorStore.setState({ level: maze, dirty: false });
      useEditorStore.getState().placeDoor(4, 3);
      expect(useEditorStore.getState().level.doors).toHaveLength(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.collideWithExit');
    });

    it('is a no-op when a door already exists on that cell', () => {
      useEditorStore.setState({ level: mazeWithFloor, dirty: false });
      useEditorStore.getState().placeDoor(1, 1);
      useEditorStore.getState().placeDoor(1, 1);
      expect(useEditorStore.getState().level.doors).toHaveLength(1);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.doorDuplicate');
    });

    it('is a no-op when a trap is already on that cell', () => {
      const maze = makeMaze({
        walls: [
          [1, 1, 1, 1, 1],
          [1, 0, 0, 1, 1],
          [1, 1, 1, 1, 1],
          [1, 1, 1, 1, 1],
        ],
        traps: [{ id: 'trap-1', x: 1, z: 1, kind: 'fire', damage: 1 }],
      });
      useEditorStore.setState({ level: maze, dirty: false });
      useEditorStore.getState().placeDoor(1, 1);
      expect(useEditorStore.getState().level.doors).toHaveLength(0);
      expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.collideWithTrap');
    });
  });

  describe('P2-18 — updateTrap / updateDoor', () => {
    it('updateTrap patches the matching trap and marks dirty', () => {
      const maze = makeMaze({
        walls: [
          [1, 1, 1, 1, 1],
          [1, 0, 0, 1, 1],
          [1, 1, 1, 1, 1],
          [1, 1, 1, 1, 1],
        ],
        traps: [{ id: 't1', x: 1, z: 1, kind: 'fire', damage: 1 }],
      });
      useEditorStore.setState({ level: maze, dirty: false });
      useEditorStore.getState().updateTrap('t1', { kind: 'water', slowDurationSec: 2 });
      const trap = useEditorStore.getState().level.traps[0];
      expect(trap.kind).toBe('water');
      expect(trap.slowDurationSec).toBe(2);
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('updateDoor patches the matching door keyColor', () => {
      const maze = makeMaze({
        walls: [
          [1, 1, 1, 1, 1],
          [1, 0, 0, 1, 1],
          [1, 1, 1, 1, 1],
          [1, 1, 1, 1, 1],
        ],
        doors: [{ id: 'd1', x: 1, z: 1, keyColor: 'red' }],
      });
      useEditorStore.setState({ level: maze, dirty: false });
      useEditorStore.getState().updateDoor('d1', { keyColor: 'blue' });
      const door = useEditorStore.getState().level.doors[0];
      expect(door.keyColor).toBe('blue');
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('updateTrap is a silent no-op when id does not match', () => {
      const maze = makeMaze({
        walls: [
          [1, 1, 1, 1, 1],
          [1, 0, 0, 1, 1],
          [1, 1, 1, 1, 1],
          [1, 1, 1, 1, 1],
        ],
        traps: [{ id: 't1', x: 1, z: 1, kind: 'fire', damage: 1 }],
      });
      useEditorStore.setState({ level: maze, dirty: false });
      useEditorStore.getState().updateTrap('nonexistent', { kind: 'water' });
      expect(useEditorStore.getState().dirty).toBe(false);
    });
  });

  describe('P2-18 — deleteSelected (trap / door)', () => {
    it('removes the matching trap when selection.kind = trap', () => {
      const maze = makeMaze({
        walls: [
          [1, 1, 1, 1, 1],
          [1, 0, 0, 1, 1],
          [1, 1, 1, 1, 1],
          [1, 1, 1, 1, 1],
        ],
        traps: [{ id: 't1', x: 1, z: 1, kind: 'fire', damage: 1 }],
      });
      useEditorStore.setState({ level: maze, selection: { kind: 'trap', id: 't1' }, dirty: false });
      useEditorStore.getState().deleteSelected();
      expect(useEditorStore.getState().level.traps).toHaveLength(0);
      expect(useEditorStore.getState().dirty).toBe(true);
    });

    it('removes the matching door when selection.kind = door', () => {
      const maze = makeMaze({
        walls: [
          [1, 1, 1, 1, 1],
          [1, 0, 0, 1, 1],
          [1, 1, 1, 1, 1],
          [1, 1, 1, 1, 1],
        ],
        doors: [{ id: 'd1', x: 1, z: 1, keyColor: 'red' }],
      });
      useEditorStore.setState({ level: maze, selection: { kind: 'door', id: 'd1' }, dirty: false });
      useEditorStore.getState().deleteSelected();
      expect(useEditorStore.getState().level.doors).toHaveLength(0);
      expect(useEditorStore.getState().dirty).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // P3-1c (H-2 fix): multi-level editor — currentLevel / addLevel /
  // removeLevel / placeTransition / updateTransition / transition
  // deletion / import / loadLevel clamp coverage.
  //
  // Background: P3-1c added the level-tab data + actions in editorStore
  // but the test file never grew cases for them — the user-facing bug
  // was "editor multi-level is half-shipped, no test pins the layer
  // contract". These cases pin each clamp / filter / default so a
  // future refactor can't silently regress.
  // -----------------------------------------------------------------------
  describe('multi-level editor (P3-1c H-2)', () => {
    describe('setCurrentLevel', () => {
      it('switches currentLevel to the requested index', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 3 }),
          currentLevel: 0,
        });
        useEditorStore.getState().setCurrentLevel(2);
        expect(useEditorStore.getState().currentLevel).toBe(2);
      });

      it('clamps currentLevel to the upper bound (levelCount - 1)', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 3 }),
          currentLevel: 0,
        });
        useEditorStore.getState().setCurrentLevel(99);
        expect(useEditorStore.getState().currentLevel).toBe(2);
      });

      it('clamps negative input to 0', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 3 }),
          currentLevel: 1,
        });
        useEditorStore.getState().setCurrentLevel(-5);
        expect(useEditorStore.getState().currentLevel).toBe(0);
      });

      it('is a no-op when the requested value equals currentLevel', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 3 }),
          currentLevel: 1,
        });
        const beforeHash = useEditorStore.getState().level.id;
        useEditorStore.getState().setCurrentLevel(1);
        expect(useEditorStore.getState().currentLevel).toBe(1);
        // No set() should have fired — the level id stays the same.
        expect(useEditorStore.getState().level.id).toBe(beforeHash);
      });

      it('clears lastError / lastErrorKey on a successful switch', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 3 }),
          currentLevel: 0,
          lastError: 'prior rejection',
          lastErrorKey: 'editor.lastError.wallOnStart',
        });
        useEditorStore.getState().setCurrentLevel(2);
        expect(useEditorStore.getState().lastError).toBeNull();
        expect(useEditorStore.getState().lastErrorKey).toBeNull();
      });

      it('clamps to 0 on a single-layer level regardless of input', () => {
        // levelCount=1, currentLevel=0. Anything positive should clamp to 0.
        useEditorStore.setState({
          level: makeMaze({ levelCount: 1 }),
          currentLevel: 0,
        });
        useEditorStore.getState().setCurrentLevel(7);
        expect(useEditorStore.getState().currentLevel).toBe(0);
      });
    });

    describe('addLevel', () => {
      it('bumps levelCount by 1 and pins currentLevel to the new top', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 1 }),
          currentLevel: 0,
          dirty: false,
        });
        useEditorStore.getState().addLevel();
        expect(useEditorStore.getState().level.levelCount).toBe(2);
        expect(useEditorStore.getState().currentLevel).toBe(1);
      });

      it('is a no-op at the 6-layer cap', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 6 }),
          currentLevel: 5,
        });
        useEditorStore.getState().addLevel();
        expect(useEditorStore.getState().level.levelCount).toBe(6);
        expect(useEditorStore.getState().currentLevel).toBe(5);
      });

      it('marks the level as dirty (so save draft / save level flag a change)', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 1 }),
          currentLevel: 0,
          dirty: false,
        });
        useEditorStore.getState().addLevel();
        expect(useEditorStore.getState().dirty).toBe(true);
      });

      it('pushes a history entry so undo can revert the structural change', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 2 }),
          currentLevel: 0,
          past: [],
          future: [],
        });
        useEditorStore.getState().addLevel();
        expect(useEditorStore.getState().past.length).toBeGreaterThan(0);
        const before = useEditorStore.getState().past.length;
        useEditorStore.getState().undo();
        expect(useEditorStore.getState().level.levelCount).toBe(2);
        expect(useEditorStore.getState().past.length).toBe(before - 1);
      });
    });

    describe('removeLevel', () => {
      it('decrements levelCount by 1 and clamps currentLevel to the new top', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 3 }),
          currentLevel: 2,
        });
        useEditorStore.getState().removeLevel();
        expect(useEditorStore.getState().level.levelCount).toBe(2);
        expect(useEditorStore.getState().currentLevel).toBe(1);
      });

      it('is a no-op at levelCount=1 (cannot remove the bottom layer)', () => {
        useEditorStore.setState({
          level: makeMaze({ levelCount: 1 }),
          currentLevel: 0,
        });
        useEditorStore.getState().removeLevel();
        expect(useEditorStore.getState().level.levelCount).toBe(1);
        expect(useEditorStore.getState().currentLevel).toBe(0);
      });

      it('filters out entities whose level equals the removed layer', () => {
        const maze = makeMaze({
          levelCount: 3,
          pickups: [
            { id: 'p0', x: 0, z: 0, type: 'time', value: 5, level: 0 },
            { id: 'p2', x: 1, z: 1, type: 'health', value: 1, level: 2 },
          ],
          enemies: [
            { id: 'e2', x: 2, z: 2, path: [{ x: 2, z: 2 }, { x: 2, z: 3 }], level: 2 },
          ],
          traps: [
            { id: 't2', x: 3, z: 2, kind: 'fire', level: 2 },
            { id: 't1', x: 3, z: 1, kind: 'water', level: 1 },
          ],
          doors: [
            { id: 'd2', x: 4, z: 2, keyColor: 'red', level: 2 },
          ],
        });
        useEditorStore.setState({ level: maze, currentLevel: 1 });
        useEditorStore.getState().removeLevel();
        // Layer 2 (the removed top) is gone — its entities drop.
        // Layer 0 and 1 entities survive.
        const after = useEditorStore.getState().level;
        expect(after.pickups.map((p) => p.id)).toEqual(['p0']);
        expect(after.enemies).toHaveLength(0);
        expect(after.traps.map((t) => t.id)).toEqual(['t1']);
        expect(after.doors).toHaveLength(0);
      });

      it('filters out transitions whose source OR destination equals the removed layer', () => {
        const maze = makeMaze({
          levelCount: 3,
          transitions: [
            { id: 'tr01', kind: 'stair-up', level: 0, x: 0, z: 0, toLevel: 1, toX: 0, toZ: 0 },
            { id: 'tr12', kind: 'stair-up', level: 1, x: 1, z: 1, toLevel: 2, toX: 1, toZ: 1 },
          ],
        });
        useEditorStore.setState({ level: maze, currentLevel: 0 });
        useEditorStore.getState().removeLevel();
        const after = useEditorStore.getState().level;
        // tr01 stays (0→1, no 2 involvement). tr12 dropped (1→2).
        expect(after.transitions?.map((t) => t.id)).toEqual(['tr01']);
      });

      it('pushed history so undo restores the removed layer + its entities', () => {
        const maze = makeMaze({
          levelCount: 2,
          pickups: [{ id: 'p1', x: 1, z: 1, type: 'time', value: 5, level: 1 }],
        });
        useEditorStore.setState({ level: maze, currentLevel: 1, past: [], future: [] });
        useEditorStore.getState().removeLevel();
        expect(useEditorStore.getState().level.levelCount).toBe(1);
        useEditorStore.getState().undo();
        expect(useEditorStore.getState().level.levelCount).toBe(2);
        expect(useEditorStore.getState().level.pickups.map((p) => p.id)).toEqual(['p1']);
      });

      it('add then remove restores the original levelCount (round-trip)', () => {
        // Round-trip contract: the user can grow and shrink the layer
        // count without losing entities on the layers they kept.
        useEditorStore.setState({
          level: makeMaze({
            levelCount: 2,
            pickups: [{ id: 'p0', x: 0, z: 0, type: 'time', value: 5, level: 0 }],
          }),
          currentLevel: 0,
        });
        useEditorStore.getState().addLevel();
        expect(useEditorStore.getState().level.levelCount).toBe(3);
        useEditorStore.getState().removeLevel();
        expect(useEditorStore.getState().level.levelCount).toBe(2);
        // L0 entity survived both ops.
        expect(useEditorStore.getState().level.pickups.map((p) => p.id)).toEqual(['p0']);
      });
    });

    describe('placeTransition', () => {
      // 5x4 walkable grid for happy-path placement.
      const openMaze = (): MazeData =>
        makeMaze({
          walls: [
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
          start: { x: 0, z: 0, level: 0 },
          exit: { x: 4, z: 3, level: 0 },
          levelCount: 3,
        });

      it("places a stair-up with toLevel = currentLevel + 1", () => {
        useEditorStore.setState({ level: openMaze(), currentLevel: 0 });
        useEditorStore.getState().placeTransition('stair-up', 2, 2);
        const t = useEditorStore.getState().level.transitions?.[0];
        expect(t).toMatchObject({ kind: 'stair-up', level: 0, x: 2, z: 2, toLevel: 1 });
      });

      it("places a stair-down with toLevel = currentLevel - 1", () => {
        useEditorStore.setState({ level: openMaze(), currentLevel: 2 });
        useEditorStore.getState().placeTransition('stair-down', 2, 2);
        const t = useEditorStore.getState().level.transitions?.[0];
        expect(t).toMatchObject({ kind: 'stair-down', level: 2, x: 2, z: 2, toLevel: 1 });
      });

      it('places a hole-up with toLevel = currentLevel + 1', () => {
        useEditorStore.setState({ level: openMaze(), currentLevel: 1 });
        useEditorStore.getState().placeTransition('hole-up', 1, 1);
        const t = useEditorStore.getState().level.transitions?.[0];
        expect(t).toMatchObject({ kind: 'hole-up', level: 1, toLevel: 2 });
      });

      it('places a hole-down with toLevel = currentLevel - 1', () => {
        useEditorStore.setState({ level: openMaze(), currentLevel: 1 });
        useEditorStore.getState().placeTransition('hole-down', 1, 1);
        const t = useEditorStore.getState().level.transitions?.[0];
        expect(t).toMatchObject({ kind: 'hole-down', level: 1, toLevel: 0 });
      });

      it('places a ladder (default toLevel clamps to currentLevel when isUp is false)', () => {
        // Ladder is NOT in the `isUp` set (stair-up / hole-up), so the
        // current implementation defaults to `currentLevel - 1` and
        // clamps into [0, count-1]. With currentLevel=0, the
        // resulting toLevel is 0 — the user can override via
        // updateTransition. We pin the actual contract so a future
        // change to ladder's default direction is caught here.
        useEditorStore.setState({ level: openMaze(), currentLevel: 0 });
        useEditorStore.getState().placeTransition('ladder', 3, 3);
        const t = useEditorStore.getState().level.transitions?.[0];
        expect(t).toMatchObject({ kind: 'ladder', level: 0, toLevel: 0 });
      });

      it('rejects placement out of bounds (no transition, no lastErrorKey)', () => {
        // OOB is a silent no-op (the spec deliberately avoids a
        // toast for OOB — the click lands on no cell). Pin the
        // contract so a future refactor can't accidentally surface
        // a translation-less "out of bounds" string.
        useEditorStore.setState({ level: openMaze(), currentLevel: 0 });
        useEditorStore.getState().placeTransition('stair-up', 99, 99);
        expect(useEditorStore.getState().level.transitions ?? []).toHaveLength(0);
        expect(useEditorStore.getState().lastErrorKey).toBeNull();
      });

      it('rejects placement on a wall cell', () => {
        const maze = makeMaze({
          walls: [
            [0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
          start: { x: 0, z: 0, level: 0 },
          exit: { x: 4, z: 3, level: 0 },
          levelCount: 2,
        });
        useEditorStore.setState({ level: maze, currentLevel: 0 });
        useEditorStore.getState().placeTransition('stair-up', 1, 1);
        expect(useEditorStore.getState().level.transitions ?? []).toHaveLength(0);
        expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.transitionOnWall');
      });

      it('rejects placement on the start cell', () => {
        useEditorStore.setState({ level: openMaze(), currentLevel: 0 });
        useEditorStore.getState().placeTransition('stair-up', 0, 0);
        expect(useEditorStore.getState().level.transitions ?? []).toHaveLength(0);
        expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.transitionOnStart');
      });

      it('rejects placement on the exit cell', () => {
        useEditorStore.setState({ level: openMaze(), currentLevel: 0 });
        useEditorStore.getState().placeTransition('stair-up', 4, 3);
        expect(useEditorStore.getState().level.transitions ?? []).toHaveLength(0);
        expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.transitionOnExit');
      });

      it('rejects a same-cell duplicate on the same source layer', () => {
        useEditorStore.setState({ level: openMaze(), currentLevel: 0 });
        useEditorStore.getState().placeTransition('stair-up', 2, 2);
        useEditorStore.getState().placeTransition('stair-up', 2, 2);
        expect(useEditorStore.getState().level.transitions).toHaveLength(1);
        expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.transitionDuplicate');
      });

      it('allows the same (x, z) on a different source layer', () => {
        useEditorStore.setState({ level: openMaze(), currentLevel: 0 });
        useEditorStore.getState().placeTransition('stair-up', 2, 2);
        useEditorStore.setState({ currentLevel: 1 });
        useEditorStore.getState().placeTransition('stair-up', 2, 2);
        expect(useEditorStore.getState().level.transitions).toHaveLength(2);
      });

      it('clamps toLevel to the top layer when stair-up is placed on the top layer', () => {
        // currentLevel=2 (top of a 3-layer maze). desiredTo = 3, but
        // Math.max(0, Math.min(2, 3)) = 2. The user can fix the
        // destination via the properties panel; the editor accepts
        // the placement so the click is never lost.
        useEditorStore.setState({ level: openMaze(), currentLevel: 2 });
        useEditorStore.getState().placeTransition('stair-up', 1, 1);
        const t = useEditorStore.getState().level.transitions?.[0];
        expect(t).toMatchObject({ kind: 'stair-up', level: 2, toLevel: 2 });
      });
    });

    describe('updateTransition', () => {
      const seeded = (): MazeData =>
        makeMaze({
          levelCount: 3,
          transitions: [
            { id: 't1', kind: 'stair-up', level: 0, x: 1, z: 1, toLevel: 1 },
          ],
        });

      it('patches the matching transition by id', () => {
        useEditorStore.setState({ level: seeded() });
        useEditorStore.getState().updateTransition('t1', { kind: 'hole-up' });
        expect(useEditorStore.getState().level.transitions?.[0].kind).toBe('hole-up');
      });

      it('clamps toLevel into [0, levelCount - 1]', () => {
        useEditorStore.setState({ level: seeded() });
        useEditorStore.getState().updateTransition('t1', { toLevel: 99 });
        expect(useEditorStore.getState().level.transitions?.[0].toLevel).toBe(2);
        useEditorStore.getState().updateTransition('t1', { toLevel: -7 });
        expect(useEditorStore.getState().level.transitions?.[0].toLevel).toBe(0);
      });

      it('patches toX / toZ (landing offset)', () => {
        useEditorStore.setState({ level: seeded() });
        useEditorStore.getState().updateTransition('t1', { toX: 2, toZ: 3 });
        expect(useEditorStore.getState().level.transitions?.[0]).toMatchObject({ toX: 2, toZ: 3 });
      });

      it('is a no-op when the id does not match any transition', () => {
        const before = seeded();
        useEditorStore.setState({ level: before });
        useEditorStore.getState().updateTransition('does-not-exist', { kind: 'ladder' });
        // Level is shallow-copied only on a real touch; on no-op the
        // transition list is unchanged. We compare by id + kind.
        expect(useEditorStore.getState().level.transitions?.[0].kind).toBe('stair-up');
      });
    });

    describe('deleteSelected: transition', () => {
      it('removes the transition matching the selection id', () => {
        const maze = makeMaze({
          levelCount: 2,
          transitions: [
            { id: 't1', kind: 'stair-up', level: 0, x: 1, z: 1, toLevel: 1 },
            { id: 't2', kind: 'stair-up', level: 0, x: 2, z: 1, toLevel: 1 },
          ],
        });
        useEditorStore.setState({ level: maze, selection: { kind: 'transition', id: 't1' } });
        useEditorStore.getState().deleteSelected();
        expect(useEditorStore.getState().level.transitions?.map((t) => t.id)).toEqual(['t2']);
      });

      it('is a no-op when the selection id is not in the transitions list', () => {
        const maze = makeMaze({
          levelCount: 2,
          transitions: [
            { id: 't1', kind: 'stair-up', level: 0, x: 1, z: 1, toLevel: 1 },
          ],
        });
        useEditorStore.setState({ level: maze, selection: { kind: 'transition', id: 'ghost' } });
        useEditorStore.getState().deleteSelected();
        expect(useEditorStore.getState().level.transitions).toHaveLength(1);
      });
    });

    describe('loadLevel currentLevel clamp', () => {
      it('clamps a stale currentLevel to the new levelCount - 1', () => {
        useEditorStore.setState({
          level: makeMaze({ id: 'a', levelCount: 1 }),
          currentLevel: 3,
        });
        const target = makeMaze({ id: 'b', levelCount: 4 });
        useEditorStore.getState().loadLevel(target);
        expect(useEditorStore.getState().level.id).toBe('b');
        expect(useEditorStore.getState().currentLevel).toBe(3);
      });

      it('clamps a stale currentLevel when the new levelCount is smaller', () => {
        useEditorStore.setState({
          level: makeMaze({ id: 'a', levelCount: 5 }),
          currentLevel: 4,
        });
        const target = makeMaze({ id: 'b', levelCount: 2 });
        useEditorStore.getState().loadLevel(target);
        expect(useEditorStore.getState().level.id).toBe('b');
        // currentLevel 4 → clamp to 1 (levelCount - 1)
        expect(useEditorStore.getState().currentLevel).toBe(1);
      });
    });
  });
});
