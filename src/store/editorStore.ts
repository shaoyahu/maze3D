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
  type EditorSelection,
} from './editorHistory';
import { exportLevel, parseImport } from '../maze/importExport';
import { validateMaze } from '../maze/JsonMazeProvider';
import { generateId } from '../utils/id';
import { useLevelStore } from './levelStore';

// Re-export the EditorSelection union from editorHistory so the rest of
// the editor codebase can import it from a single place. Keeping the
// symbol in editorHistory (a pure module) makes it trivial to test in
// isolation. The `Editor` prefix avoids the DOM `Selection` shadow.
export type { EditorSelection } from './editorHistory';

// Editor-local camera state. Kept here (rather than in the runtime
// gameStore) because the editor's pan/zoom is independent from the
// in-game player camera. The viewport is 2D (no 3D orbit) — `x`/`y` are
// pan offsets in screen pixels and `zoom` is the CSS scale factor.
export interface EditorCamera {
  x: number;
  y: number;
  zoom: number;
}

/** Discriminated-union return type of `useEditorStore.saveLevel`.
 *
 *  `{ ok: true }` means the level passed `validateMaze` and was merged
 *  into the level store. `{ ok: false, error }` means validation
 *  rejected the in-memory level; `error` is the underlying
 *  `LevelLoadError.message` so the caller can surface it verbatim to
 *  the user (the toolbar pattern). Keeps the editor decoupled from the
 *  validator's error class while preserving the message detail that
 *  the previous `boolean` return type used to discard. */
export type SaveResult = { ok: true } | { ok: false; error: string };

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
  // The EditorSelection union is exported from ./editorHistory
  // (re-exported above). We reference it by name here so the property
  // type doesn't self-reference the interface we're declaring. The
  // `Editor` prefix avoids the DOM `Selection` shadow.
  selection: EditorSelection | null;
  camera: EditorCamera;
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
  /** Wall-clock ms of the most recent successful save. null when never
   *  saved in this session. The status bar formats this as HH:MM:SS. */
  lastSavedAt: number | null;
  /** Last user-facing error message (e.g. "无法在起点放置墙"). The toolbar
   *  reads this to surface silent-reject feedback; the consumer is
   *  responsible for calling `clearLastError` (or auto-clearing via
   *  useEffect) once it has been shown. null when there is nothing to
   *  report. F-2026-06-12-H1. */
  lastError: string | null;
  /** F-2026-06-12-B2: hash of the level at the last "save baseline"
   *  (initial empty level, last `saveLevel` success, last `loadLevel`,
   *  last `loadDraft`, or last `importJson`). `dirty` is derived from
   *  `levelHash(level) !== lastSavedHash`, so undoing back to the saved
   *  state correctly clears dirty (the monotonic-boolean approach would
   *  force dirty=true forever after the first edit, even if the user
   *  undid back to a saved snapshot). */
  lastSavedHash: string | null;

  // session lifecycle
  newLevel: (width: number, depth: number) => void;
  loadLevel: (maze: MazeData) => void;
  /** Persists the current level to the level store.
   *
   *  - On a successful save, returns `{ ok: true }`, clears `dirty` and
   *    sets `lastSavedAt` to the wall-clock ms.
   *  - On a validation failure (validateMaze threw a `LevelLoadError`),
   *    returns `{ ok: false, error }` with the underlying validator
   *    message so callers can show *what* is structurally wrong, and
   *    leaves `dirty` true so the user knows the in-memory state still
   *    diverges from the last persisted version. */
  saveLevel: () => SaveResult;

  // tool / camera / selection (UI state, no history push)
  setTool: (tool: EditorTool) => void;
  setCamera: (patch: Partial<EditorCamera>) => void;
  select: (sel: EditorStoreState['selection']) => void;
  clearSelection: () => void;
  /** Clears the user-facing error banner. Call this from a useEffect
   *  timer (or after the user dismisses the message). F-2026-06-12-H1. */
  clearLastError: () => void;

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
  // F-N1: commit current level to history (called from path-node input blur)
  commitEnemyPath: () => void;

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
const DEFAULT_CAMERA: EditorCamera = { x: 0, y: 0, zoom: 1 };

// ---------------------------------------------------------------------------
// helpers — all operate on plain data so they can be unit-tested without
// touching the store.
// ---------------------------------------------------------------------------

function buildEmptyLevel(width: number, depth: number): MazeData {
  // F-2026-06-12-M3: reject degenerate sizes with a clear RangeError so
  // the caller sees "width=0 is invalid" instead of a cryptic
  // `TypeError: Cannot set properties of undefined` from the carve step.
  if (!Number.isInteger(width) || !Number.isInteger(depth) || width < 1 || depth < 1) {
    throw new RangeError(
      `buildEmptyLevel: width and depth must be positive integers (got width=${width}, depth=${depth})`,
    );
  }
  // All-walls grid: every cell is a wall. The user carves out floors.
  const walls: CellType[][] = [];
  for (let z = 0; z < depth; z += 1) {
    const row: CellType[] = [];
    for (let x = 0; x < width; x += 1) row.push(1);
    walls.push(row);
  }
  // F-2026-06-12-T2: carve start (0,0) and exit (width-1, depth-1) so the new level
  // passes `validateMaze` out of the box. Without this, "Save" on an
  // un-edited new level throws "start/exit is on a wall".
  carveCells(walls, [
    { x: 0, z: 0 },
    { x: width - 1, z: depth - 1 },
  ]);
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

// F-2026-06-12-M1: shared helper used by `buildEmptyLevel` (always carves
// (0,0) and (width-1, depth-1)) and `updateSize` (carves the clamped
// start/exit). Mutates `walls` in place and returns it so callers can
// chain. The two carve sites used to drift independently — a future
// change to "carve" semantics (e.g. validate-and-coalesce neighbors) only
// needs to land here.
function carveCells(
  walls: CellType[][],
  cells: ReadonlyArray<{ x: number; z: number }>,
): CellType[][] {
  for (const { x, z } of cells) {
    walls[z]![x] = 0;
  }
  return walls;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// F-2026-06-12-B2: deterministic hash of the level used as the dirty
// oracle. JSON.stringify is fast and stable for plain data and gives us
// structural equality without a deep-equal dep. Hash is compared against
// `lastSavedHash` to decide if the in-memory level diverges from the
// last persisted/loaded snapshot. The maze is small (cells = w*d, max
// ~50*50) so the per-action cost is negligible.
function levelHash(level: MazeData): string {
  return JSON.stringify(level);
}

// Internal helper: returns a new level slice with the level replaced and
// history refreshed. Store actions use this for every data-mutating call
// so the bookkeeping (push, clear future, derive dirty) stays uniform.
// F-2026-06-12-B2: `dirty` is no longer a monotonic boolean — it is
// derived from the hash of the new level vs. the last-saved hash so
// undoing back to the saved snapshot correctly clears dirty.
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
    dirty: levelHash(next.level) !== state.lastSavedHash,
  };
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

export const useEditorStore = create<EditorStoreState>((set, get) => {
  // Initial level is a tiny pre-carved canvas — every cell is a wall
  // EXCEPT start (0,0) and exit (width-1, depth-1) which `buildEmptyLevel`
  // opens up so the level passes `validateMaze` out of the box. Callers
  // can still call newLevel/loadLevel to replace it.
  const initialLevel = buildEmptyLevel(5, 4);

  // F-2026-06-12-B2: the initial level IS the "saved baseline" until the
  // user makes their first edit. Without seeding lastSavedHash the very
  // first placeWall would set dirty=true (hash diverges from null) and
  // the user would see a phantom "● 未保存" on a brand-new, unedited
  // level. We treat the initial empty canvas as already-saved.
  const initialLastSavedHash = levelHash(initialLevel);

  return {
    level: initialLevel,
    tool: 'select',
    selection: null,
    camera: { ...DEFAULT_CAMERA },
    past: [],
    future: [],
    dirty: false,
    lastSavedAt: null,
    lastError: null,
    lastSavedHash: initialLastSavedHash,

    // ---- session lifecycle ----
    newLevel: (width, depth) => {
      const level = buildEmptyLevel(width, depth);
      // F-2026-06-12-B2: a freshly built level is the new save baseline —
      // dirty must start false so the toolbar doesn't show "● 未保存" on
      // a brand-new, unedited canvas.
      set({
        level,
        past: [],
        future: [],
        selection: null,
        dirty: false,
        lastSavedAt: null,
        lastError: null,
        lastSavedHash: levelHash(level),
      });
    },

    loadLevel: (maze) => {
      // F-2026-06-12-B2: the loaded level IS the new save baseline.
      set({
        level: maze,
        past: [],
        future: [],
        selection: null,
        dirty: false,
        lastSavedAt: null,
        lastError: null,
        lastSavedHash: levelHash(maze),
      });
    },

    saveLevel: () => {
      // Side effect: delegate persistence to the level store. We do NOT
      // push history here — save is IO, not data mutation.
      //
      // `saveCustom` calls `validateMaze`, which can throw `LevelLoadError`
      // when the editor is in a state that doesn't satisfy the maze
      // contract (e.g. start/exit out of bounds, walls dimension mismatch).
      // We catch the throw and surface it as a `SaveResult` so the caller
      // (EditorToolbar) can show the validator's actual message verbatim
      // to the user (matching the import-error pattern at
      // EditorToolbar.handleImportChange). We deliberately do NOT clear
      // `dirty` on failure — the in-memory level still diverges from the
      // last persisted version.
      try {
        const level = get().level;
        useLevelStore.getState().saveCustom(level);
        // F-2026-06-12-B2: a successful save advances the baseline. The
        // hash of what we just persisted becomes the new oracle — any
        // subsequent edit will be compared against *this* snapshot, not
        // the pre-save one. dirty=false is now derived from the hash, but
        // we set it explicitly so the toolbar's "● 未保存" disappears the
        // moment the user clicks Save (before the next render).
        set({ dirty: false, lastSavedAt: Date.now(), lastSavedHash: levelHash(level) });
        return { ok: true } as const;
      } catch (e) {
        // Defensive: validateMaze is the documented thrower, but we don't
        // import its error class to keep the store decoupled. Fall back to
        // String(e) so a non-Error throw still produces a useful status
        // message rather than an empty string.
        const message = e instanceof Error ? e.message : String(e);
        console.warn('editorStore.saveLevel: validation failed', e);
        return { ok: false, error: message } as const;
      }
    },

    // ---- UI state (no history push) ----
    setTool: (tool) => set({ tool }),

    setCamera: (patch) => set({ camera: { ...get().camera, ...patch } }),

    select: (sel) => set({ selection: sel }),

    clearSelection: () => set({ selection: null }),

    clearLastError: () => set({ lastError: null }),

    // ---- placement actions ----
    placeWall: (x, z) => {
      const { level } = get();
      if (!inBounds(x, z, level.size.width, level.size.depth)) return;
      // F-2026-06-12-T2: silent-reject toggling start/exit into walls.
      // Cross-reference: placeStart (line 327), placeExit (line 334), and
      // addEnemyNode (line 473) all use the same early-return pattern when
      // the requested cell violates the level contract. Without this guard
      // a single click on the start cell produces a level that fails
      // `validateMaze` ("start is on a wall").
      if (x === level.start.x && z === level.start.z) {
        // F-2026-06-12-H1: surface the silent-reject so the user knows
        // why the click was dropped, not just that "nothing happened".
        set({ lastError: '无法在起点放置墙（墙不能覆盖起点）' });
        return;
      }
      if (x === level.exit.x && z === level.exit.z) {
        set({ lastError: '无法在终点放置墙（墙不能覆盖终点）' });
        return;
      }
      const nextWalls = level.walls.map((r, zi) =>
        zi === z ? r.map((c, xi) => (xi === x ? ((c === 1 ? 0 : 1) as CellType) : c)) : r,
      );
      const nextLevel: MazeData = { ...level, walls: nextWalls };
      set({ ...commitLevel(get(), nextLevel), lastError: null });
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
      // F-2026-06-12-B2: dirty is derived from the hash so an edit that
      // happens to produce a value already equal to the saved snapshot
      // (e.g. typing the same character that was there before) leaves
      // dirty=false.
      set({ level: nextLevel, dirty: levelHash(nextLevel) !== get().lastSavedHash });
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
      // F-2026-06-12-B2: hash-based dirty — see updatePickup.
      set({ level: nextLevel, dirty: levelHash(nextLevel) !== get().lastSavedHash });
    },

    updateRule: (patch) => {
      const { level } = get();
      const nextRules: LevelRules = { ...level.rules, ...patch };
      const nextLevel: MazeData = { ...level, rules: nextRules };
      // F-2026-06-12-B2: hash-based dirty — see updatePickup.
      set({ level: nextLevel, dirty: levelHash(nextLevel) !== get().lastSavedHash });
    },

    updateName: (name) => {
      const { level } = get();
      const nextLevel: MazeData = { ...level, name };
      // F-2026-06-12-B2: hash-based dirty — see updatePickup.
      set({ level: nextLevel, dirty: levelHash(nextLevel) !== get().lastSavedHash });
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
      // F-2026-06-12-T2: carve the (clamped) start/exit cells so the resized level
      // passes `validateMaze` out of the box. Without this, shrinking the
      // grid can leave the start or exit sitting on a regenerated wall.
      carveCells(walls, [
        { x: startX, z: startZ },
        { x: exitX, z: exitZ },
      ]);
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
      // F-N1: dirty-only — no history push. The panel commits to
      // history on blur via commitEnemyPath. Without this, every
      // keystroke would push a history entry and saturate
      // HISTORY_LIMIT=50 within a few edits.
      const cx = clamp(x, 0, level.size.width - 1);
      const cz = clamp(z, 0, level.size.depth - 1);
      const nextEnemies = level.enemies.map((e) => {
        if (e.id !== enemyId) return e;
        const path = e.path.map((n, i) => (i === nodeIndex ? { x: cx, z: cz } : n));
        return { ...e, path } as EnemySpawn;
      });
      const nextLevel: MazeData = { ...level, enemies: nextEnemies };
      // F-2026-06-12-B2: hash-based dirty — see updatePickup. Crucial
      // here because the panel may call moveEnemyNode repeatedly while
      // the user drags; an edit that lands on the saved snapshot must
      // leave dirty=false so we don't show "● 未保存" spuriously.
      set({ level: nextLevel, dirty: levelHash(nextLevel) !== get().lastSavedHash });
    },

    // F-N1: explicit history commit for the path-node editing flow.
    // Called from the panel's path-node input onBlur. Idempotent —
    // repeated calls just push repeated snapshots, but the panel
    // guards with a draft-vs-committed check.
    commitEnemyPath: () => {
      set(commitLevel(get(), get().level, get().selection));
    },

    addEnemyNode: (enemyId, x, z) => {
      const { level } = get();
      // F7: silently reject OOB patrol nodes. `validateMaze` (post-F7)
      // would refuse to load the saved level, but matching
      // `removeEnemyNode` (line 432-440) with a silent reject here
      // keeps the store from holding an obviously-invalid path
      // between edits. Unlike `moveEnemyNode` (which clamps — a
      // different intent: drag-handler must produce a node somewhere
      // on the canvas), add is a discrete click and an OOB click is
      // a logic error, not a UX input.
      if (x < 0 || z < 0 || x >= level.size.width || z >= level.size.depth) {
        return;
      }
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
      // Defensive: every placement action in this store uses silent
      // rejection (`return;`) when the action would produce an invalid
      // state. Match the idiom here — a UI double-click or a queued
      // keypress cannot break the store, and the editor's path-edit UI
      // (Task 12) will simply hide the delete affordance when only 2
      // nodes remain.
      if (target.path.length <= 2) return;
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
      } else if (selection.kind === 'wall') {
        // wall — restore the cell to a wall.
        const { x, z } = selection;
        if (!inBounds(x, z, level.size.width, level.size.depth)) return;
        const walls = level.walls.map((r, zi) =>
          zi === z ? r.map((c, xi) => (xi === x ? 1 : c)) : r,
        );
        nextLevel = { ...level, walls };
      } else {
        // F-L1: exhaustiveness check. If a new EditorSelection kind is
        // added without a branch here, the `never` assertion fails to
        // compile (selection narrows to the never-after cases), catching
        // the missing branch at build time instead of silently passing
        // null to commitLevel → set a `level: null` state.
        const _exhaustive: never = selection;
        throw new Error(`deleteSelected: unhandled selection kind ${String(_exhaustive)}`);
      }
      set(commitLevel(get(), nextLevel, nextSelection));
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
        // F-2026-06-12-B2: dirty is derived from the hash. Undoing back
        // to the saved snapshot correctly clears dirty (the previous
        // unconditional `dirty: true` would leave a phantom "● 未保存"
        // even after the user had nothing unsaved).
        dirty: levelHash(next.level) !== get().lastSavedHash,
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
        // F-2026-06-12-B2: hash-based dirty — see undo.
        dirty: levelHash(next.level) !== get().lastSavedHash,
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
        // F-2026-06-12-B2: the loaded draft IS the new save baseline.
        set({
          level: validated,
          past: [],
          future: [],
          selection: null,
          dirty: false,
          lastSavedHash: levelHash(validated),
        });
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
      // F-2026-06-12-B2: the imported level IS the new save baseline.
      set({
        level: renamed,
        past: [],
        future: [],
        selection: null,
        dirty: false,
        lastSavedAt: null,
        lastSavedHash: levelHash(renamed),
      });
    },

    exportJson: () => exportLevel(get().level),
  };
});
