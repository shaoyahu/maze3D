import { expandThickWall, type TreeEdge } from './_expandThickWall';
import type { CellType } from '../types';

// Eller's algorithm on a thick-wall grid.
//
// Row-by-row generation:
//   1. Right unions: scan the row left-to-right; with 50% probability, join
//      each cell with its right neighbor (only if they are in different
//      sets; the "right cell" inherits the "left cell"'s set id).
//   2. Down carvings (skip on the last row): for each unique set in the
//      row, pick at least one cell to carve down to the next row (otherwise
//      the set would become orphaned from the rest of the maze). Other
//      cells in the set have a 50% chance of also carving down.
//   3. Last row: force-join all cells in different sets via right unions.
//      This guarantees the maze is fully connected.
//
// Set id maintenance: a cell in row r+1 inherits its parent's set id iff
// the parent carved down; otherwise it gets a fresh set id. The set system
// tracks "logical connectivity" — two cells in the same set are reachable
// via the emitted tree edges, even if not directly connected within a row.
//
// The tree is then expanded into the visualSize x visualSize walls matrix
// by the shared _expandThickWall helper.
export function generateEller(visualSize: number, rng: () => number): CellType[][] {
  const logicalSize = Math.ceil(visualSize / 2);
  const treeEdges = buildEllerTree(logicalSize, rng);
  return expandThickWall(visualSize, treeEdges);
}

function buildEllerTree(size: number, rng: () => number): TreeEdge[] {
  const edges: TreeEdge[] = [];
  // rowSets[c] = set id of cell (c, currentRow). Reused across rows.
  let rowSets: number[] = Array.from({ length: size }, (_, c) => c);
  // nextSetId = next fresh set id to assign when a cell starts a new set.
  let nextSetId = size;
  // cameFromAbove[c] = true if cell (c, r-1) carved down to (c, r).
  // Cells that carved down keep their set id; others get a fresh one.
  let cameFromAbove: boolean[] = new Array(size).fill(false);

  for (let r = 0; r < size; r++) {
    // Step 1: assign set ids for this row.
    if (r > 0) {
      for (let c = 0; c < size; c++) {
        if (!cameFromAbove[c]) {
          rowSets[c] = nextSetId++;
        }
      }
    }

    // Step 2: right unions.
    if (r < size - 1) {
      // Non-last row: 50% probability per pair, skip if same set.
      for (let c = 0; c < size - 1; c++) {
        if (rng() < 0.5 && rowSets[c] !== rowSets[c + 1]) {
          unionInto(rowSets, c + 1, c, size);
          edges.push({ ax: c, az: r, bx: c + 1, bz: r });
        }
      }
    } else {
      // Last row: force-join all cells in different sets.
      for (let c = 0; c < size - 1; c++) {
        if (rowSets[c] !== rowSets[c + 1]) {
          unionInto(rowSets, c + 1, c, size);
          edges.push({ ax: c, az: r, bx: c + 1, bz: r });
        }
      }
    }

    // Step 3: prepare down carvings for the next row (skip on last row).
    const nextCameFromAbove = new Array(size).fill(false);
    if (r < size - 1) {
      // Group cells in the current row by their set id.
      const setCells = new Map<number, number[]>();
      for (let c = 0; c < size; c++) {
        const s = rowSets[c];
        let arr = setCells.get(s);
        if (!arr) {
          arr = [];
          setCells.set(s, arr);
        }
        arr.push(c);
      }
      for (const cells of setCells.values()) {
        // Must pick at least one cell from this set to carve down.
        const mustPick = cells[Math.floor(rng() * cells.length)];
        nextCameFromAbove[mustPick] = true;
        edges.push({ ax: mustPick, az: r, bx: mustPick, bz: r + 1 });
        // Maybe pick more (50% probability per other cell in the set).
        for (const c of cells) {
          if (c !== mustPick && rng() < 0.5) {
            nextCameFromAbove[c] = true;
            edges.push({ ax: c, az: r, bx: c, bz: r + 1 });
          }
        }
      }
    }

    cameFromAbove = nextCameFromAbove;
  }

  return edges;
}

// Union (oldIdx, newIdx): reassign all cells with rowSets[oldIdx]'s set
// to rowSets[newIdx]'s set. Used by right unions. Inline O(N) scan is
// fine for our logical sizes (≤ 25).
function unionInto(rowSets: number[], oldIdx: number, newIdx: number, size: number): void {
  const oldSet = rowSets[oldIdx];
  const newSet = rowSets[newIdx];
  for (let k = 0; k < size; k++) {
    if (rowSets[k] === oldSet) rowSets[k] = newSet;
  }
}
