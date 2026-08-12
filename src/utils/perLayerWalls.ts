import type { CellType, MazeData } from '../maze/types';

// P5-editor-multilayer: per-layer wall helpers — single source of truth for
// reading / mutating the `walls xor walls2d` mutex on `MazeData`. Pulled out
// of `editorStore.ts` and `EditorViewport.tsx` so the editor's
// addLevel/removeLevel/validation paths and the runtime's per-layer reads
// share one place to ask "what's the grid for layer L right now?".
//
// Contract (mirrors P5-2 spec §7):
//   - `walls`  = `CellType[][]`     — present iff `levelCount === 1`
//   - `walls2d` = `CellType[][][]`  — present iff `levelCount >= 2`
//   - Exactly one of the two is set on every persisted level.
//   - `getCurrentLayerWalls` is the safe reader; it falls back through
//     `walls2d[L] → walls2d[0] → walls → []` so any caller that holds a
//     partially-loaded MazeData never sees `undefined`.

/**
 * Returns the wall grid for the requested layer. Callers (Scene / Minimap /
 * ParchmentMap / enemySpawner / LevelSelect / editorStore / EditorViewport)
 * use this as the single entry point instead of branching on
 * `maze.walls2d` themselves.
 *
 * Back-compat: if a legacy caller passes a level that has neither shape
 * (shouldn't happen post-P5-2, but defensive), returns an empty grid
 * rather than throwing — the engine treats "no walls" as "all walkable",
 * which is the safest fallback for rendering.
 */
export function getCurrentLayerWalls(
  level: MazeData,
  currentLevel: number,
): CellType[][] {
  // Multi-layer: read `walls2d[currentLevel]`. Bounds check guards
  // against stale `currentLevel` (e.g. right after a removeLevel
  // collapsed a 3-layer level to 1 while the UI still shows L2).
  if (level.walls2d && level.walls2d[currentLevel]) {
    return level.walls2d[currentLevel]!;
  }
  // Multi-layer but the requested index is missing — fall back to L0
  // (the editor's safe default after collapseToSingleLayer) so the
  // caller still gets a non-undefined grid.
  if (level.walls2d && level.walls2d[0]) {
    return level.walls2d[0]!;
  }
  // Single-layer (98% of existing levels). Non-null assertion is safe:
  // per the strict mutex the validator never produces a `MazeData`
  // with both fields undefined.
  return level.walls!;
}

/**
 * Single-layer → multi-layer promotion. The editor calls this inside
 * `addLevel` (before bumping `levelCount`) so the resulting level has
 * a `walls2d` field with `levelCount` entries — the same shape the
 * engine expects from a hand-authored multi-layer JSON.
 *
 * `clone` mode copies the current L0 grid as the seed for the new
 * layer (P5-2 decision A2: "addLevel 克隆当前 layer"). `empty` mode
 * starts the new layer as a fully walkable grid of the same size
 * (used by the spec's import / reset paths).
 *
 * No-op when the level is already multi-layer — calling this on a
 * 2-layer level is a programmer error, but returning the level
 * untouched is safer than throwing in an editor action.
 */
export function promoteToMultiLayer(
  level: MazeData,
  options: { clone?: 'clone' | 'empty' } = {},
): MazeData {
  if (level.walls2d) return level; // already multi-layer
  const cloneMode = options.clone ?? 'clone';
  // strict mutex: per the validator, a single-layer level always has
  // `walls` set; the non-null assertion is a TypeScript-only hint.
  const firstLayer = level.walls!;
  const newLayer =
    cloneMode === 'clone'
      ? firstLayer.map((row) => row.slice())
      : createEmptyGrid(level.size.width, level.size.depth);
  // P5-2 decision A5: strict `walls xor walls2d` mutex — drop
  // `walls` so the promoted level matches the round-trip JSON
  // shape. Spreading `level` first then assigning `walls: undefined`
  // and `walls2d: [...]` produces a level where the only per-layer
  // wall container is `walls2d`.
  return {
    ...level,
    walls: undefined,
    walls2d: [firstLayer, newLayer],
  };
}

/**
 * Multi-layer → single-layer collapse. Called by `removeLevel` when
 * the user has deleted down to one layer. The L0 grid is kept (so
 * every existing single-layer consumer — Minimap, LevelSelect thumb,
 * enemySpawner — keeps reading the same shape) and `walls2d` is
 * dropped.
 *
 * No-op when the level is already single-layer.
 */
export function collapseToSingleLayer(level: MazeData): MazeData {
  if (!level.walls2d) return level;
  // L0 is the survivor; defensive copy so callers can mutate the
  // returned grid without aliasing the original `walls2d[0]`.
  const walls = level.walls2d[0].map((row) => row.slice());
  // destructure to drop `walls2d` from the spread — strict mutex
  // requires `walls xor walls2d`, so the collapsed level must not
  // keep `walls2d` even if the rest of the data flows through.
  const { walls2d: _drop, ...rest } = level;
  void _drop;
  return { ...rest, walls };
}

/**
 * Build a width × depth grid of zeros (all walkable). Used by
 * `promoteToMultiLayer(..., { clone: 'empty' })` and by tests that
 * need a baseline grid. Exported so callers don't have to import
 * a per-cell literal.
 */
export function createEmptyGrid(width: number, depth: number): CellType[][] {
  const grid: CellType[][] = [];
  for (let z = 0; z < depth; z++) {
    const row: CellType[] = [];
    for (let x = 0; x < width; x++) row.push(0 as CellType);
    grid.push(row);
  }
  return grid;
}
