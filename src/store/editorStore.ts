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
import { safeSetItem, MAX_DRAFT_BYTES } from './persist';

// Re-export the EditorSelection union from editorHistory so the rest of
// the editor codebase can import it from a single place. Keeping the
// symbol in editorHistory (a pure module) makes it trivial to test in
// isolation. The `Editor` prefix avoids the DOM `Selection` shadow.
export type { EditorSelection } from './editorHistory';

// Editor-local camera state. Kept here (rather than in the runtime
// gameStore) because the editor's pan/zoom is independent from the
// in-game player camera. The viewport is 2D (no 3D orbit) — `x`/`y` are
// pan offsets in screen pixels and `zoom` is the CSS scale factor.
interface EditorCamera {
  x: number;
  y: number;
  zoom: number;
}

/** Discriminated-union return type of `useEditorStore.saveLevel`.
 *
 *  F-project-review-2026-06-13-A-HIGH-2: the editor and the level store
 *  are now decoupled. `saveLevel` no longer mutates the level store as a
 *  side effect — it only validates the in-memory level and returns it
 *  for the caller to persist (EditorToolbar.handleSave, EditorPage.
 *  handleExit, useAutoSave).
 *
 *  - `{ ok: true, level }` means the level passed `validateMaze` and is
 *    safe to hand to `useLevelStore.saveCustom(level)`. We return the
 *    same object so callers don't need to reach into the store state.
 *  - `{ ok: false, error }` means validation rejected the in-memory
 *    level; `error` is the underlying `LevelLoadError.message` so the
 *    caller can surface it verbatim (the toolbar pattern). Keeps the
 *    editor decoupled from the validator's error class while preserving
 *    the message detail that the previous `boolean` return type used to
 *    discard. */
type SaveResult = { ok: true; level: MazeData } | { ok: false; error: string };

// Local alias: only the slice fields we replace on each commit. We pass
// this to `set(...)` to keep the per-action code uniform.
type LevelSlice = {
  level: MazeData;
  past: Snapshot[];
  future: Snapshot[];
  selection: EditorStoreState['selection'];
  dirty: boolean;
};

interface EditorStoreState {
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
   *  report. F-2026-06-12-H1. P2-8: prefer `lastErrorKey` so the
   *  consumer can `t()`-translate via the i18n module; `lastError`
   *  remains as a fallback string passthrough for legacy callers. */
  lastError: string | null;
  /** P2-8: stable i18n key for the editor's last surfaced error
   *  (placeWall / placeStart / placeExit / appendEnemyPathNode). The
   *  UI reads this and translates via `t(lastErrorKey)`; null means
   *  no editor-emitted error is active. */
  lastErrorKey: string | null;
  /** F-2026-06-12-B2: hash of the level at the last "save baseline"
   *  (initial empty level, last `saveLevel` success, last `loadLevel`,
   *  last `loadDraft`, or last `importJson`). `dirty` is derived from
   *  `levelHash(level) !== lastSavedHash`, so undoing back to the saved
   *  state correctly clears dirty (the monotonic-boolean approach would
   *  force dirty=true forever after the first edit, even if the user
   *  undid back to a saved snapshot). */
  lastSavedHash: string | null;
  /** F-project-review-2026-06-13-D-5/D-18: true when the most recent
   *  draft write was rejected because localStorage is full. The status
   *  bar reads this to show a red "存储已满" banner. Cleared via
   *  {@link clearStorageFull} once the user takes a corrective action
   *  (saves to the level store, deletes a custom level, etc.). */
  storageFull: boolean;
  /** User-facing message for the most recent draft failure. `null` when
   *  no error is pending. Reset on the next successful `saveDraft`. */
  lastDraftError: string | null;

  // session lifecycle
  newLevel: (width: number, depth: number) => void;
  loadLevel: (maze: MazeData) => void;
  /** Validates the current level and (on success) advances the saved
   *  baseline. The returned `level` is the same object the store holds,
   *  pre-validated by `validateMaze` — callers (EditorToolbar,
   *  EditorPage, useAutoSave) own the actual persistence step (typically
   *  by handing the level to `useLevelStore.saveCustom`).
   *
   *  - On a successful validation, returns `{ ok: true, level }`,
   *    clears `dirty`, sets `lastSavedAt` to the wall-clock ms, and
   *    records `lastSavedHash` so dirty-detection has a fresh oracle.
   *  - On a validation failure (validateMaze threw a `LevelLoadError`),
   *    returns `{ ok: false, error }` with the underlying validator
   *    message so callers can show *what* is structurally wrong, and
   *    leaves `dirty` true so the user knows the in-memory state still
   *    diverges from the last persisted version.
   *
   *  F-project-review-2026-06-13-A-HIGH-2: previously this action also
   *  wrote the level to the level store as a side effect, which silently
   *  coupled the two stores. The refactor makes persistence the caller's
   *  responsibility so the editor store has no awareness of where levels
   *  are persisted. */
  saveLevel: () => SaveResult;

  // tool / camera / selection (UI state, no history push)
  setTool: (tool: EditorTool) => void;
  setCamera: (patch: Partial<EditorCamera>) => void;
  select: (sel: EditorStoreState['selection']) => void;
  clearSelection: () => void;
  /** Clears the user-facing error banner. Call this from a useEffect
   *  timer (or after the user dismisses the message). F-2026-06-12-H1. */
  clearLastError: () => void;
  /** F-project-review-2026-06-13-D-5/D-18: clears the
   *  `storageFull` / `lastDraftError` pair once the user takes a
   *  corrective action (saves to the level store, deletes a custom
   *  level, etc.). The status bar reads these to render a red banner;
   *  the banner's dismissal handler invokes this. */
  clearStorageFull: () => void;

  // placement actions (push history)
  placeWall: (x: number, z: number) => void;
  placeStart: (x: number, z: number) => void;
  placeExit: (x: number, z: number) => void;
  placePickup: (x: number, z: number) => void;
  placeEnemy: (x: number, z: number, width: number) => void;
  // Append a new patrol waypoint to the given enemy. Used by the
  // "click a cell to extend the patrol path" viewport interaction.
  appendEnemyPathNode: (enemyId: string, x: number, z: number) => void;

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
    lastErrorKey: null,
    lastSavedHash: initialLastSavedHash,
    // F-project-review-2026-06-13-D-5/D-18: a fresh editor session has
    // never written to localStorage, so neither flag is pending.
    storageFull: false,
    lastDraftError: null,

    // ---- session lifecycle ----
    newLevel: (width, depth) => {
      const level = buildEmptyLevel(width, depth);
      // F-2026-06-12-B2: a freshly built level is the new save baseline —
      // dirty must start false so the toolbar doesn't show "● 未保存" on
      // a brand-new, unedited canvas.
      // F-project-review-2026-06-13-D-5/D-18: switching to a fresh level
      // is a corrective action — clear the storageFull / lastDraftError
      // pair so the red banner disappears in the same render.
      set({
        level,
        past: [],
        future: [],
        selection: null,
        dirty: false,
        lastSavedAt: null,
        lastError: null,
        lastSavedHash: levelHash(level),
        storageFull: false,
        lastDraftError: null,
      });
    },

    loadLevel: (maze) => {
      // F-2026-06-12-B2: the loaded level IS the new save baseline.
      // F-project-review-2026-06-13-D-5/D-18: switching to a loaded
      // level is a corrective action — clear storageFull /
      // lastDraftError so the red banner disappears.
      set({
        level: maze,
        past: [],
        future: [],
        selection: null,
        dirty: false,
        lastSavedAt: null,
        lastError: null,
        lastSavedHash: levelHash(maze),
        storageFull: false,
        lastDraftError: null,
      });
    },

    saveLevel: () => {
      // F-project-review-2026-06-13-A-HIGH-2: this action no longer
      // writes to the level store as a side effect. It validates the
      // level locally and returns it; the caller decides where to
      // persist. See the JSDoc on `saveLevel` for the full contract.
      //
      // We do NOT push history here — save is IO, not data mutation.
      //
      // `validateMaze` can throw `LevelLoadError` when the editor is in
      // a state that doesn't satisfy the maze contract (e.g. start/exit
      // out of bounds, walls dimension mismatch). We catch the throw and
      // surface it as a `SaveResult` so the caller (EditorToolbar) can
      // show the validator's actual message verbatim to the user
      // (matching the import-error pattern at
      // EditorToolbar.handleImportChange). We deliberately do NOT clear
      // `dirty` on failure — the in-memory level still diverges from
      // the last persisted version.
      try {
        const level = get().level;
        validateMaze(level, level.id);
        // F-2026-06-12-B2: a successful save advances the baseline. The
        // hash of what we just validated becomes the new oracle — any
        // subsequent edit will be compared against *this* snapshot, not
        // the pre-save one. dirty=false is now derived from the hash, but
        // we set it explicitly so the toolbar's "● 未保存" disappears the
        // moment the user clicks Save (before the next render).
        // F-project-review-2026-06-13-D-5/D-18: a successful validation
        // implies the level is well-formed and the caller will persist
        // it; that persistence path is also the one that clears the
        // storageFull / lastDraftError pair, but we reset the flags
        // here too so the red banner disappears as soon as the user
        // makes a structurally valid save (the draft autosave that
        // triggered the banner will retry on the next tick).
        set({
          dirty: false,
          lastSavedAt: Date.now(),
          lastSavedHash: levelHash(level),
          storageFull: false,
          lastDraftError: null,
        });
        return { ok: true, level } as const;
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

    clearLastError: () => set({ lastError: null, lastErrorKey: null }),

    // F-project-review-2026-06-13-D-5/D-18: a successful levelStore
    // save (or a corrective edit that shrinks the draft below
    // MAX_DRAFT_BYTES) means the storage is no longer "full" from
    // the editor's point of view. Resetting both flags here lets the
    // EditorStatusBar's red banner disappear in the same render.
    clearStorageFull: () => set({ storageFull: false, lastDraftError: null }),

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
        // P2-8: emit a stable i18n key instead of a hardcoded string
        // so the UI layer can t()-translate via the i18n module.
        set({ lastError: null, lastErrorKey: 'editor.lastError.wallOnStart' });
        return;
      }
      if (x === level.exit.x && z === level.exit.z) {
        set({ lastError: null, lastErrorKey: 'editor.lastError.wallOnExit' });
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
      if (!inBounds(x, z, level.size.width, level.size.depth)) {
        set({ lastError: null, lastErrorKey: 'editor.lastError.startOutOfBounds' });
        return;
      }
      // F-2026-06-15-C-1: silent-reject when target cell IS the current exit.
      // validateMaze would reject "start and exit are on the same cell" at
      // save time; surfacing the rejection at click time keeps editor UX in
      // sync with the runtime contract.
      if (level.exit.x === x && level.exit.z === z) {
        set({ lastError: null, lastErrorKey: 'editor.lastError.startOnExit' });
        return;
      }
      // Auto-carve the cell if it's currently a wall — UX win so the user
      // can drop a start on top of an existing wall rather than getting a
      // silent reject. Mirrors the carve-on-resize behaviour.
      let nextWalls = level.walls;
      if (level.walls[z]![x] === 1) {
        nextWalls = level.walls.map((r, zi) =>
          zi === z ? r.map((c, xi) => (xi === x ? 0 : c)) : r,
        );
      }
      const nextLevel: MazeData = { ...level, start: { x, z }, walls: nextWalls };
      set({ ...commitLevel(get(), nextLevel), lastError: null });
    },

    placeExit: (x, z) => {
      const { level } = get();
      if (!inBounds(x, z, level.size.width, level.size.depth)) {
        set({ lastError: null, lastErrorKey: 'editor.lastError.exitOutOfBounds' });
        return;
      }
      // F-2026-06-15-C-1: mirror of placeStart — silent-reject when target
      // cell IS the current start. See placeStart for rationale.
      if (level.start.x === x && level.start.z === z) {
        set({ lastError: null, lastErrorKey: 'editor.lastError.exitOnStart' });
        return;
      }
      // Auto-carve the cell if it's currently a wall so the user can drop
      // an exit on top of a wall instead of getting a silent reject.
      let nextWalls = level.walls;
      if (level.walls[z]![x] === 1) {
        nextWalls = level.walls.map((r, zi) =>
          zi === z ? r.map((c, xi) => (xi === x ? 0 : c)) : r,
        );
      }
      const nextLevel: MazeData = { ...level, exit: { x, z }, walls: nextWalls };
      set({ ...commitLevel(get(), nextLevel), lastError: null });
    },

    placePickup: (x, z) => {
      const { level } = get();
      if (!isFloor(level, x, z)) return;
      // Match the runtime: never let a pickup sit on the start cell.
      if (level.start.x === x && level.start.z === z) return;
      // F-2026-06-15-C-1: also mirror the runtime exit-cell rejection
      // (JsonMazeProvider:176-178). Without this guard the user can drop a
      // pickup on exit; validateMaze then rejects at save time, leaving the
      // user confused about what happened.
      if (level.exit.x === x && level.exit.z === z) return;
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
      if (!inBounds(x, z, level.size.width, level.size.depth)) return;
      // Spec: path = [(x,z), (x±1, z)]. We pick x+1 by default, but at the
      // right edge (x === width-1) we fall back to x-1 so the two seed
      // nodes are NEVER identical — a zero-length path segment renders
      // an undefined SVG marker-end orientation and confuses enemy AI
      // patrol code that assumes adjacent path nodes differ.
      const secondX = x === width - 1 ? Math.max(0, x - 1) : x + 1;
      // Auto-carve both path cells — validateMaze rejects path nodes
      // that sit on walls (JsonMazeProvider line ~285), so a fresh
      // enemy on an all-walls level would otherwise fail auto-save
      // silently. Carving keeps the UX consistent with placeStart /
      // placeExit (which also auto-carve).
      const carveSet: ReadonlyArray<{ x: number; z: number }> = [
        { x, z },
        { x: secondX, z },
      ];
      let nextWalls = level.walls;
      for (const { x: cx, z: cz } of carveSet) {
        if (nextWalls[cz]![cx] === 1) {
          nextWalls = nextWalls.map((r, zi) =>
            zi === cz ? r.map((c, xi) => (xi === cx ? 0 : c)) : r,
          );
        }
      }
      const newEnemy: EnemySpawn = {
        id: generateId(),
        x,
        z,
        path: [
          { x, z },
          { x: secondX, z },
        ],
      };
      const nextLevel: MazeData = { ...level, walls: nextWalls, enemies: [...level.enemies, newEnemy] };
      // Auto-select the freshly placed enemy so the user lands in the
      // path-planning UX (panel opens, subsequent clicks add path nodes).
      set(commitLevel(get(), nextLevel, { kind: 'enemy', id: newEnemy.id }));
    },

    // Append a node to an enemy's patrol path. The first click after
    // selecting an enemy (in enemy tool mode) lands here — used by the
    // viewport's "click to add path waypoint" interaction.
    appendEnemyPathNode: (enemyId, nx, nz) => {
      const { level } = get();
      if (!inBounds(nx, nz, level.size.width, level.size.depth)) {
        set({ lastError: null, lastErrorKey: 'editor.lastError.pathOutOfBounds' });
        return;
      }
      // Reject a no-op append: clicking the same cell twice would otherwise
      // produce a zero-length path segment, breaking SVG marker-end
      // orientation and producing undefined behaviour in the AI patrol
      // state machine that assumes adjacent path nodes differ.
      const target = level.enemies.find((e) => e.id === enemyId);
      if (!target) return;
      const last = target.path[target.path.length - 1];
      if (last && last.x === nx && last.z === nz) return;
      // Carve the new path node — same reason as placeEnemy: a
      // path node on a wall fails validateMaze and breaks auto-save.
      let nextWalls = level.walls;
      if (nextWalls[nz]![nx] === 1) {
        nextWalls = nextWalls.map((r, zi) =>
          zi === nz ? r.map((c, xi) => (xi === nx ? 0 : c)) : r,
        );
      }
      const nextEnemies = level.enemies.map((e) =>
        e.id === enemyId ? { ...e, path: [...e.path, { x: nx, z: nz }] } : e,
      );
      const nextLevel: MazeData = { ...level, walls: nextWalls, enemies: nextEnemies };
      set({ ...commitLevel(get(), nextLevel, { kind: 'enemy', id: enemyId }), lastError: null });
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
      // F-2026-06-15-H-3.5: resizing wipes pickups/enemies from the level
      // (the all-walls grid above replaces them on next placement). The
      // current selection may now point at a pickup/enemy that no longer
      // exists, or at a wall cell outside the new bounds. Clear the
      // selection if it has become an orphan so PropertiesPanel doesn't
      // render against missing data.
      const sel = get().selection;
      let nextSelection: EditorSelection | null = sel;
      if (sel !== null) {
        if (sel.kind === 'wall') {
          if (!inBounds(sel.x, sel.z, width, depth)) nextSelection = null;
        } else if (sel.kind === 'pickup') {
          if (!nextLevel.pickups.some((p) => p.id === sel.id)) nextSelection = null;
        } else if (sel.kind === 'enemy') {
          if (!nextLevel.enemies.some((e) => e.id === sel.id)) nextSelection = null;
        }
      }
      set(commitLevel(get(), nextLevel, nextSelection));
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
      // F-2026-06-15-M-4.4: defensive bounds check on nodeIndex. Without
      // this, an out-of-range index silently no-ops via `filter` (since no
      // element matches) — looks like the call worked but nothing changed.
      // The UI guard below (path.length <= 2) protects the legitimate path,
      // but a stale React event or test typo can still pass a bad index.
      if (nodeIndex < 0 || nodeIndex >= target.path.length) return;
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
      // F-project-review-2026-06-13 (A-HIGH-3, D-5, D-18, D-23, D-26,
      // D-29): route the autosave through `safeSetItem` so a quota /
      // too-large / unavailable failure is surfaced through the
      // `storageFull` + `lastDraftError` pair instead of being
      // swallowed by a `console.warn` and silently dropping the
      // user's last 2s of edits. The `MAX_DRAFT_BYTES` cap bails
      // BEFORE calling `setItem` when the payload would blow past
      // 1 MiB, so a single oversized write can't evict unrelated
      // keys (e.g. `maze3d.customLevels.v1`) on quota-strict browsers.
      const result = safeSetItem(
        DRAFT_STORAGE_KEY,
        { level: get().level },
        MAX_DRAFT_BYTES,
      );
      if (result.ok) {
        // Clear a stale banner left by the previous failure. Guard
        // the `set` to avoid waking subscribers when neither flag is
        // actually pending (the common case — most ticks succeed).
        const { storageFull, lastDraftError } = get();
        if (storageFull || lastDraftError !== null) {
          set({ storageFull: false, lastDraftError: null });
        }
        return;
      }
      // Failure: map the discriminated reason to a Chinese message.
      // Only `quota` and `too-large` toggle `storageFull` (which the
      // status bar reads to render a red banner) — `unavailable`
      // (private mode, no localStorage) and `serialization` (cyclic
      // data, BigInt) are surfaced through `lastDraftError` but the
      // banner color stays a normal warning since "full" isn't the
      // right diagnosis.
      const MESSAGES: Record<typeof result.reason, string> = {
        unavailable: '浏览器存储不可用，自动保存已禁用',
        'too-large': '当前关卡过大，自动保存被跳过（请删除部分拾取/敌人或缩小地图）',
        quota: '本地存储已满，自动保存失败（请删除旧关卡后重试）',
        serialization: '关卡数据无法序列化，自动保存失败',
      };
      set({
        storageFull: result.reason === 'quota' || result.reason === 'too-large',
        lastDraftError: MESSAGES[result.reason],
      });
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
        //
        // D-19: validateMaze now cross-checks the caller-supplied id
        // against the level's own id (line 54-66 of JsonMazeProvider).
        // The previous hard-coded 'editor-draft' label silently
        // mismatched any draft whose id was anything else, so we must
        // pass the draft's own id here. Fall back to 'imported' (same
        // sentinel parseImport uses, src/maze/importExport.ts:75-76)
        // for hand-edited drafts that omit the id field — validateMaze
        // will reject an absent id regardless, so the fallback only
        // affects the error message.
        const draftObj = obj.level as Record<string, unknown>;
        const draftId =
          typeof draftObj.id === 'string' && draftObj.id.length > 0
            ? draftObj.id
            : 'imported';
        const validated = validateMaze(obj.level, draftId);
        // F-2026-06-12-B2: the loaded draft IS the new save baseline.
        // F-project-review-2026-06-13-D-5/D-18: switching to a loaded
        // level invalidates any `storageFull` / `lastDraftError` left
        // by a prior session's failed draft writes.
        set({
          level: validated,
          past: [],
          future: [],
          selection: null,
          dirty: false,
          lastSavedHash: levelHash(validated),
          storageFull: false,
          lastDraftError: null,
        });
        // F-project-review-2026-06-13-D-10: re-write the validated
        // form back to localStorage so a hand-edited (but still
        // schema-passing) draft is canonicalized on next read. If
        // the re-write itself fails (quota / too-large), saveDraft
        // surfaces it via the same banner machinery.
        get().saveDraft();
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
      // F-project-review-2026-06-13-D-5/D-18: switching to an imported
      // level is a corrective action — clear storageFull /
      // lastDraftError so the red banner disappears.
      set({
        level: renamed,
        past: [],
        future: [],
        selection: null,
        dirty: false,
        lastSavedAt: null,
        lastSavedHash: levelHash(renamed),
        storageFull: false,
        lastDraftError: null,
      });
    },

    exportJson: () => exportLevel(get().level),
  };
});
