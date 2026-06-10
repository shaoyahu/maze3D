// P2-4b Plan Task 8: useEditorStore (核心).
//
// The editor's main in-memory session state. Owns the level being edited,
// the active tool, the current selection, an editor-local camera pose, the
// undo/redo history (delegated to editorHistory as pure functions), and a
// `dirty` flag tracking unsaved changes.
//
// History lives outside the store in `src/store/editorHistory.ts`; this
// store snapshots the level through the pure `pushHistory` helper on every
// data-mutating action, and replays those snapshots via `undo`/`redo`.
//
// All mutating actions are immutable (they construct a new `level` and pass
// it to `pushHistory`); the past/future stacks rely on `structuredClone` so
// post-mutation edits never corrupt history.

import { create } from 'zustand';
import type {
  MazeData,
  EditorTool,
  Pickup,
  EnemySpawn,
  LevelRules,
  CellType,
} from '../maze/types';
import {
  pushHistory,
  undo as historyUndo,
  redo as historyRedo,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  type Snapshot,
} from './editorHistory';
import { exportLevel, parseImport } from '../maze/importExport';
import { validateMaze } from '../maze/JsonMazeProvider';
import { generateId } from '../utils/id';
import { useLevelStore } from './levelStore';

// Re-export the Selection union from editorHistory so the rest of the
// editor codebase can import it from a single place. Keeping the symbol
// in editorHistory (a pure module) makes it trivial to test in isolation.
export type { Selection } from './editorHistory';

// Editor-local camera position. Kept here (rather than in the runtime
// gameStore) because the editor's orbit/pan state is independent from
// the in-game player camera.
export interface EditorCamera {
  x: number;
  y: number;
  z: number;
}

// Local alias: only the slice fields we replace on each commit. We pass
// this to `set(...)` to keep the per-action code uniform.
type LevelSlice = {
  level: MazeData;
  past: Snapshot[];
  future: Snapshot[];
  selection: EditorStoreState['selection'];
  dirty: boolean;
};

export interface EditorStoreState {
  level: MazeData;
  tool: EditorTool;
  selection: EditorStoreState['selection'];
  camera: EditorCamera;
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;

  // session lifecycle
  newLevel: (width: number, depth: number) => void;
  loadLevel: (maze: MazeData) => void;
  saveLevel: () => void;

  // tool / camera / selection (UI state, no history push)
  setTool: (tool: EditorTool) => void;
  setCamera: (patch: Partial<EditorCamera>) => void;
  select: (sel: EditorStoreState['selection']) => void;
  clearSelection: () => void;

  // placement actions (push history)
  placeWall: (x: number, z: number) => void;
  placeStart: (x: number, z: number) => void;
  placeExit: (x: number, z: number) => void;
  placePickup: (x: number, z: number) => void;
  placeEnemy: (x: number, z: number, width: number) => void;

  // patch actions (mark dirty; history is debounced/blurred separately)
  updatePickup: (id: string, patch: Partial<Pickup>) => void;
  updateEnemy: (id: string, patch: Partial<EnemySpawn>) => void;
  updateRule: (patch: Partial<LevelRules>) => void;
  updateName: (name: string) => void;
  updateSize: (width: number, depth: number) => void;

  // enemy path edits (push history)
  moveEnemyNode: (enemyId: string, nodeIndex: number, x: number, z: number) => void;
  addEnemyNode: (enemyId: string, x: number, z: number) => void;
  removeEnemyNode: (enemyId: string, nodeIndex: number) => void;

  // selection-driven delete (push history)
  deleteSelected: () => void;

  // history
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // persistence helpers
  saveDraft: () => void;
  loadDraft: () => void;
  importJson: (raw: string) => void;
  exportJson: () => string;
}

const DRAFT_STORAGE_KEY = 'maze3d.editorDraft.v1';
const DEFAULT_NAME = '新关卡';
const DEFAULT_RULES: LevelRules = {
  initialTime: 60,
  maxHealth: 3,
  victory: 'reach-exit',
  timeOnPickup: 10,
};
const DEFAULT_CAMERA: EditorCamera = { x: 0, y: 10, z: 0 };

// ---------------------------------------------------------------------------
// helpers — all operate on plain data so they can be unit-tested without
// touching the store.
// ---------------------------------------------------------------------------

function buildEmptyLevel(width: number, depth: number): MazeData {
  // All-walls grid: every cell is a wall. The user carves out floors.
  const walls: CellType[][] = [];
  for (let z = 0; z < depth; z += 1) {
    const row: CellType[] = [];
    for (let x = 0; x < width; x += 1) row.push(1);
    walls.push(row);
  }
  return {
    id: `custom-${generateId()}`,
    name: DEFAULT_NAME,
    size: { width, depth },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: width - 1, z: depth - 1 },
    walls,
    pickups: [],
    enemies: [],
    rules: { ...DEFAULT_RULES },
  };
}

function inBounds(x: number, z: number, width: number, depth: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(z) &&
    x >= 0 &&
    x < width &&
    z >= 0 &&
    z < depth
  );
}

function isFloor(level: MazeData, x: number, z: number): boolean {
  return inBounds(x, z, level.size.width, level.size.depth) && level.walls[z]![x] === 0;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// Internal helper: returns a new level slice with the level replaced and
// history refreshed. Store actions use this for every data-mutating call
// so the bookkeeping (push, clear future, mark dirty) stays uniform.
function commitLevel(
  state: EditorStoreState,
  nextLevel: MazeData,
  nextSelection: EditorStoreState['selection'] = state.selection,
): LevelSlice {
  const next = pushHistory(
    { level: state.level, selection: state.selection, past: state.past, future: state.future },
    nextLevel,
    nextSelection,
  );
  return {
    level: next.level,
    past: next.past,
    future: next.future,
    selection: next.selection,
    dirty: true,
  };
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

export const useEditorStore = create<EditorStoreState>((set, get) => {
  // Initial level is a tiny empty (all-walls) canvas. Callers should
  // immediately invoke newLevel/loadLevel on mount.
  const initialLevel = buildEmptyLevel(5, 4);

  return {
    level: initialLevel,
    tool: 'select',
    selection: null,
    camera: { ...DEFAULT_CAMERA },
    past: [],
    future: [],
    dirty: false,

    // ---- session lifecycle ----
    newLevel: (width, depth) => {
      set({
        level: buildEmptyLevel(width, depth),
        past: [],
        future: [],
        selection: null,
        dirty: false,
      });
    },

    loadLevel: (maze) => {
      set({ level: maze, past: [], future: [], selection: null, dirty: false });
    },

    saveLevel: () => {
      // Side effect: delegate persistence to the level store. We do NOT
      // push history here — save is IO, not data mutation.
      useLevelStore.getState().saveCustom(get().level);
      set({ dirty: false });
    },

    // ---- UI state (no history push) ----
    setTool: (tool) => set({ tool }),

    setCamera: (patch) => set({ camera: { ...get().camera, ...patch } }),

    select: (sel) => set({ selection: sel }),

    clearSelection: () => set({ selection: null }),

    // ---- placement actions ----
    placeWall: (x, z) => {
      const { level } = get();
      if (!inBounds(x, z, level.size.width, level.size.depth)) return;
      const nextWalls = level.walls.map((r, zi) =>
        zi === z ? r.map((c, xi) => (xi === x ? ((c === 1 ? 0 : 1) as CellType) : c)) : r,
      );
      const nextLevel: MazeData = { ...level, walls: nextWalls };
      set(commitLevel(get(), nextLevel));
    },

    placeStart: (x, z) => {
      const { level } = get();
      if (!isFloor(level, x, z)) return;
      const nextLevel: MazeData = { ...level, start: { x, z } };
      set(commitLevel(get(), nextLevel));
    },

    placeExit: (x, z) => {
      const { level } = get();
      if (!isFloor(level, x, z)) return;
      const nextLevel: MazeData = { ...level, exit: { x, z } };
      set(commitLevel(get(), nextLevel));
    },

    placePickup: (x, z) => {
      const { level } = get();
      if (!isFloor(level, x, z)) return;
      // Match the runtime: never let a pickup sit on the start cell.
      if (level.start.x === x && level.start.z === z) return;
      const newPickup: Pickup = {
        id: generateId(),
        x,
        z,
        type: 'time',
        value: 10,
      };
      const nextLevel: MazeData = { ...level, pickups: [...level.pickups, newPickup] };
      // Per spec: placePickup also clears the selection.
      set(commitLevel(get(), nextLevel, null));
    },

    placeEnemy: (x, z, width) => {
      const { level } = get();
      // Spec: path = [(x,z), (min(x+1, width-1), z)].
      const secondX = clamp(x + 1, 0, width - 1);
      const newEnemy: EnemySpawn = {
        id: generateId(),
        x,
        z,
        path: [
          { x, z },
          { x: secondX, z },
        ],
      };
      const nextLevel: MazeData = { ...level, enemies: [...level.enemies, newEnemy] };
      set(commitLevel(get(), nextLevel));
    },

    // ---- patch actions (mark dirty; no immediate history push) ----
    updatePickup: (id, patch) => {
      const { level } = get();
      let touched = false;
      const nextPickups = level.pickups.map((p) => {
        if (p.id !== id) return p;
        touched = true;
        return { ...p, ...patch } as Pickup;
      });
      if (!touched) return;
      const nextLevel: MazeData = { ...level, pickups: nextPickups };
      // Dirty only; the spec calls for the history push to be debounced to
      // input blur (300ms) — EditorPropertiesPanel (Task 12) will own that
      // timer. For now we still bump dirty so the user sees a save prompt.
      set({ level: nextLevel, dirty: true });
    },

    updateEnemy: (id, patch) => {
      const { level } = get();
      let touched = false;
      const nextEnemies = level.enemies.map((e) => {
        if (e.id !== id) return e;
        touched = true;
        return { ...e, ...patch } as EnemySpawn;
      });
      if (!touched) return;
      const nextLevel: MazeData = { ...level, enemies: nextEnemies };
      set({ level: nextLevel, dirty: true });
    },

    updateRule: (patch) => {
      const { level } = get();
      const nextRules: LevelRules = { ...level.rules, ...patch };
      const nextLevel: MazeData = { ...level, rules: nextRules };
      set({ level: nextLevel, dirty: true });
    },

    updateName: (name) => {
      const { level } = get();
      const nextLevel: MazeData = { ...level, name };
      set({ level: nextLevel, dirty: true });
    },

    updateSize: (width, depth) => {
      const { level } = get();
      // All-walls grid: the user re-carves after a resize, just like newLevel.
      const walls: CellType[][] = [];
      for (let z = 0; z < depth; z += 1) {
        const row: CellType[] = [];
        for (let x = 0; x < width; x += 1) row.push(1);
        walls.push(row);
      }
      // Clamp start/exit into the new bounds so the validator cannot reject
      // the level (start/exit must be in bounds and on a floor).
      const startX = clamp(level.start.x, 0, width - 1);
      const startZ = clamp(level.start.z, 0, depth - 1);
      const exitX = clamp(level.exit.x, 0, width - 1);
      const exitZ = clamp(level.exit.z, 0, depth - 1);
      const nextLevel: MazeData = {
        ...level,
        size: { width, depth },
        walls,
        start: { x: startX, z: startZ },
        exit: { x: exitX, z: exitZ },
      };
      set(commitLevel(get(), nextLevel));
    },

    // ---- enemy path edits ----
    moveEnemyNode: (enemyId, nodeIndex, x, z) => {
      const { level } = get();
      const cx = clamp(x, 0, level.size.width - 1);
      const cz = clamp(z, 0, level.size.depth - 1);
      const nextEnemies = level.enemies.map((e) => {
        if (e.id !== enemyId) return e;
        const path = e.path.map((n, i) => (i === nodeIndex ? { x: cx, z: cz } : n));
        return { ...e, path } as EnemySpawn;
      });
      const nextLevel: MazeData = { ...level, enemies: nextEnemies };
      set(commitLevel(get(), nextLevel));
    },

    addEnemyNode: (enemyId, x, z) => {
      const { level } = get();
      const nextEnemies = level.enemies.map((e) =>
        e.id === enemyId ? { ...e, path: [...e.path, { x, z }] } : e,
      );
      const nextLevel: MazeData = { ...level, enemies: nextEnemies };
      set(commitLevel(get(), nextLevel));
    },

    removeEnemyNode: (enemyId, nodeIndex) => {
      const { level } = get();
      const target = level.enemies.find((e) => e.id === enemyId);
      if (!target) return;
      if (target.path.length <= 2) {
        throw new Error('Enemy path must keep at least 2 nodes');
      }
      const nextEnemies = level.enemies.map((e) =>
        e.id === enemyId
          ? { ...e, path: e.path.filter((_, i) => i !== nodeIndex) }
          : e,
      );
      const nextLevel: MazeData = { ...level, enemies: nextEnemies };
      set(commitLevel(get(), nextLevel));
    },

    // ---- selection-driven delete ----
    deleteSelected: () => {
      const { level, selection } = get();
      if (selection === null) return;
      let nextLevel: MazeData | null = null;
      let nextSelection: EditorStoreState['selection'] = null;
      if (selection.kind === 'pickup') {
        const pickups = level.pickups.filter((p) => p.id !== selection.id);
        if (pickups.length === level.pickups.length) return; // nothing to do
        nextLevel = { ...level, pickups };
      } else if (selection.kind === 'enemy') {
        const enemies = level.enemies.filter((e) => e.id !== selection.id);
        if (enemies.length === level.enemies.length) return;
        nextLevel = { ...level, enemies };
      } else {
        // wall — restore the cell to a wall.
        const { x, z } = selection;
        if (!inBounds(x, z, level.size.width, level.size.depth)) return;
        const walls = level.walls.map((r, zi) =>
          zi === z ? r.map((c, xi) => (xi === x ? 1 : c)) : r,
        );
        nextLevel = { ...level, walls };
      }
      set(commitLevel(get(), nextLevel!, nextSelection));
    },

    // ---- history ----
    undo: () => {
      const { level, selection, past, future } = get();
      const next = historyUndo({ level, selection, past, future });
      if (next.level === level) return; // no-op when past is empty
      set({
        level: next.level,
        selection: next.selection,
        past: next.past,
        future: next.future,
        // Undo puts the user back in a state that may or may not match the
        // last saved version. Conservatively mark dirty so the user knows
        // they have unsaved changes that diverge from the last save.
        dirty: true,
      });
    },

    redo: () => {
      const { level, selection, past, future } = get();
      const next = historyRedo({ level, selection, past, future });
      if (next.level === level) return;
      set({
        level: next.level,
        selection: next.selection,
        past: next.past,
        future: next.future,
        dirty: true,
      });
    },

    canUndo: () =>
      historyCanUndo({
        level: get().level,
        selection: get().selection,
        past: get().past,
        future: get().future,
      }),

    canRedo: () =>
      historyCanRedo({
        level: get().level,
        selection: get().selection,
        past: get().past,
        future: get().future,
      }),

    // ---- persistence helpers ----
    saveDraft: () => {
      try {
        const payload = JSON.stringify({ level: get().level });
        localStorage.setItem(DRAFT_STORAGE_KEY, payload);
      } catch (e) {
        console.warn('editorStore.saveDraft: failed', e);
      }
    },

    loadDraft: () => {
      try {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (raw == null) return;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return;
        const obj = parsed as Record<string, unknown>;
        if (!('level' in obj)) return;
        // Run through validateMaze to make sure a hand-edited localStorage
        // entry can't poison the editor. validateMaze is the same gate
        // JsonMazeProvider runs hand-crafted levels through.
        const validated = validateMaze(obj.level, 'editor-draft');
        set({ level: validated, past: [], future: [], selection: null, dirty: false });
      } catch (e) {
        console.warn('editorStore.loadDraft: failed', e);
      }
    },

    importJson: (raw) => {
      // parseImport throws ImportError on any structural failure — we let
      // it bubble so the caller (EditorToolbar) can show a user-facing
      // error. On success the level's id is rewritten to a fresh custom
      // prefix; the original name is preserved (parseImport gives us the
      // validated level where name has already been normalized).
      const { level } = parseImport(raw);
      const renamed: MazeData = { ...level, id: `custom-${generateId()}` };
      set({ level: renamed, past: [], future: [], selection: null, dirty: false });
    },

    exportJson: () => exportLevel(get().level),
  };
});
