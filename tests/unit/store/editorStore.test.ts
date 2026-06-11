// P2-4b Task 8: useEditorStore (核心) tests.
//
// TDD scaffold for the editor's main Zustand store. Each test resets state
// via `useEditorStore.setState({...})` in beforeEach so cases stay
// independent. AAA structure throughout (Arrange / Act / Assert blocks).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useLevelStore } from '../../../src/store/levelStore';
import type { MazeData, Pickup, EnemySpawn, LevelRules, CellType } from '../../../src/maze/types';

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
    start: { x: 0, z: 0 },
    exit: { x: 4, z: 3 },
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
    it('produces a level with the right id prefix, default name, all-1 walls, and default rules', () => {
      // Arrange / Act
      useEditorStore.getState().newLevel(5, 4);

      // Assert
      const lvl = useEditorStore.getState().level;
      expect(lvl.id.startsWith('custom-')).toBe(true);
      expect(lvl.name).toBe('新关卡');
      expect(lvl.size).toEqual({ width: 5, depth: 4 });
      expect(lvl.start).toEqual({ x: 0, z: 0 });
      expect(lvl.exit).toEqual({ x: 4, z: 3 });
      expect(lvl.walls).toHaveLength(4);
      for (const row of lvl.walls) {
        expect(row).toHaveLength(5);
        for (const c of row) expect(c).toBe(1);
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
    it('delegates to useLevelStore.saveCustom with the current level', () => {
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
      useEditorStore.getState().saveLevel();
      // Assert
      expect(spy).toHaveBeenCalledWith(lvl);
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
    it('toggles walls[z][x] from 1→0, sets dirty, and pushes history', () => {
      // Arrange
      useEditorStore.setState({
        level: makeMaze(),
        past: [],
      });
      // Act
      useEditorStore.getState().placeWall(0, 0);
      // Assert
      expect(useEditorStore.getState().level.walls[0]![0]).toBe(0);
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('toggles walls[z][x] back from 0→1 on a second call (one history entry per call)', () => {
      // Arrange — start with a floor cell.
      useEditorStore.setState({
        level: makeMaze({
          walls: [
            [0, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
          ],
        }),
        past: [],
      });
      // Act
      useEditorStore.getState().placeWall(0, 0);
      // Assert
      expect(useEditorStore.getState().level.walls[0]![0]).toBe(1);
      expect(useEditorStore.getState().past.length).toBe(1);
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
      expect(useEditorStore.getState().level.start).toEqual({ x: 2, z: 2 });
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('placeStart on a wall cell is rejected (no change, no history, no dirty flip)', () => {
      // Arrange — (3,1) is a wall in the default all-1 grid.
      useEditorStore.setState({ past: [], dirty: false });
      // Act
      useEditorStore.getState().placeStart(3, 1);
      // Assert
      expect(useEditorStore.getState().level.start).toEqual({ x: 0, z: 0 });
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(0);
    });

    it('placeStart out of bounds is rejected', () => {
      // Arrange
      useEditorStore.setState({ past: [], dirty: false });
      // Act
      useEditorStore.getState().placeStart(99, 99);
      // Assert
      expect(useEditorStore.getState().level.start).toEqual({ x: 0, z: 0 });
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
      expect(useEditorStore.getState().level.exit).toEqual({ x: 1, z: 1 });
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
  });

  // -----------------------------------------------------------------------
  // 8. placeEnemy
  // -----------------------------------------------------------------------
  describe('placeEnemy', () => {
    it('appends an enemy with a default 2-node path on a non-edge cell', () => {
      // Arrange
      useEditorStore.setState({ past: [] });
      // Act
      useEditorStore.getState().placeEnemy(0, 0, 5);
      // Assert
      const enemies = useEditorStore.getState().level.enemies;
      expect(enemies).toHaveLength(1);
      const e = enemies[0]!;
      expect(e.id.length).toBeGreaterThan(0);
      expect(e.x).toBe(0);
      expect(e.z).toBe(0);
      expect(e.path).toEqual([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ]);
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(1);
    });

    it('clamps the second path node to the last column on the right edge (width=1)', () => {
      // Arrange
      useEditorStore.setState({ past: [] });
      // Act
      useEditorStore.getState().placeEnemy(4, 0, 5);
      // Assert — second node clamped from (5, 0) to (4, 0).
      const e = useEditorStore.getState().level.enemies[0]!;
      expect(e.path).toEqual([
        { x: 4, z: 0 },
        { x: 4, z: 0 },
      ]);
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

    it('updateSize regenerates walls (all 1s) and clamps start/exit when out of bounds', () => {
      // Arrange — start at (0,0), exit at (4,3); resize to 3x3 (so exit is out of bounds).
      useEditorStore.setState({ past: [] });
      // Act
      useEditorStore.getState().updateSize(3, 3);
      // Assert
      const lvl = useEditorStore.getState().level;
      expect(lvl.size).toEqual({ width: 3, depth: 3 });
      expect(lvl.walls).toHaveLength(3);
      for (const row of lvl.walls) {
        expect(row).toHaveLength(3);
        for (const c of row) expect(c).toBe(1);
      }
      // Exit (4,3) → (2,2) after clamp.
      expect(lvl.exit).toEqual({ x: 2, z: 2 });
      // Start stays in bounds.
      expect(lvl.start).toEqual({ x: 0, z: 0 });
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

    it('restores the wall (sets walls[z][x]=1) when selection.kind = "wall"', () => {
      // Arrange — (2,1) is a floor, selected for deletion.
      const walls: CellType[][] = [
        [0, 1, 1, 1, 1],
        [1, 0, 1, 1, 1],
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
      // Assert
      expect(useEditorStore.getState().level.walls[1]![2]).toBe(1);
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
    it('undo restores the previous wall state after placeWall', () => {
      // Arrange
      useEditorStore.setState({
        level: makeMaze(), // (0,0) is 1
        past: [],
      });
      useEditorStore.getState().placeWall(0, 0);
      expect(useEditorStore.getState().level.walls[0]![0]).toBe(0);
      // Act
      useEditorStore.getState().undo();
      // Assert
      expect(useEditorStore.getState().level.walls[0]![0]).toBe(1);
    });

    it('redo replays the undone action', () => {
      // Arrange
      useEditorStore.setState({
        level: makeMaze(),
        past: [],
      });
      useEditorStore.getState().placeWall(0, 0);
      useEditorStore.getState().undo();
      // Act
      useEditorStore.getState().redo();
      // Assert
      expect(useEditorStore.getState().level.walls[0]![0]).toBe(0);
    });

    it('a new push after undo clears the future stack (branch is cut)', () => {
      // Arrange
      useEditorStore.setState({ level: makeMaze(), past: [] });
      useEditorStore.getState().placeWall(0, 0); // future: []
      useEditorStore.getState().placeWall(1, 0); // future: []
      useEditorStore.getState().undo(); // future: [2nd]
      const futureLen = useEditorStore.getState().future.length;
      expect(futureLen).toBeGreaterThan(0);
      // Act
      useEditorStore.getState().placeWall(2, 0);
      // Assert
      expect(useEditorStore.getState().future).toEqual([]);
    });

    it('canUndo / canRedo reflect the current history state', () => {
      // Arrange
      useEditorStore.setState({ level: makeMaze(), past: [] });
      // Act / Assert
      expect(useEditorStore.getState().canUndo()).toBe(false);
      expect(useEditorStore.getState().canRedo()).toBe(false);
      useEditorStore.getState().placeWall(0, 0);
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
      expect(lvl.start).toEqual({ x: 0, z: 0 });
      expect(lvl.pickups).toHaveLength(1);
      expect(lvl.pickups[0]!.x).toBe(1);
      expect(lvl.pickups[0]!.z).toBe(0);
    });
  });
});
