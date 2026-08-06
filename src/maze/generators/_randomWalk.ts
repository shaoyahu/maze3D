// Shared helpers for generators that walk a 4-connected grid with random
// direction picks.
//
// The procedural generators (Aldous-Broder, Wilson's, Parallel Backtracker,
// Houston's phases, …) all repeatedly "pick a random neighbor". They differ
// in two ways that callers must preserve:
//
//   1. **Direction shuffle pattern.** Most generators consume a Fisher–Yates
//      shuffle of the 4 cardinal directions (3 rng() calls per pick).
//      `recursiveBacktracker.ts` is the one exception: it uses a cheaper
//      "pick a random first direction, then iterate the other three in a
//      fixed order" pattern (1 rng() call per pick) — see the comment near
//      its `orderedDirs` helper. Substituting Fisher–Yates there would
//      change the rng() consumption count and break determinism for a
//      given seed, so this helper deliberately exposes both shapes.
//
//   2. **OOB semantics on an out-of-bounds pick.** Aldous-Broder wants
//      "stay put" (current unchanged if all 4 directions land OOB —
//      doesn't happen in practice but the safety net is there); Wilson's
//      wants "don't add the OOB step to the path" (the walk simply does
//      not advance); Parallel Backtracker and the other RB variants want
//      "try the next direction". All four are equivalent to "scan the
//      shuffled directions in order, return the first in-bounds one";
//      the only difference is what the caller does with the result.

export interface DirOffset {
  dx: number;
  dz: number;
}

// Fisher–Yates shuffle of the 4 cardinal directions. 3 rng() calls per
// invocation; this matches the inline pattern used by aldousBroder.ts,
// wilsons.ts, houston.ts, and parallelBacktracker.ts (so swapping in this
// helper preserves the rng() consumption count and therefore the
// deterministic output for a given seed).
export function shuffle4Directions(rng: () => number): DirOffset[] {
  const dirs: DirOffset[] = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
  ];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = dirs[i];
    dirs[i] = dirs[j];
    dirs[j] = tmp;
  }
  return dirs;
}

// Pick the first in-bounds neighbor of a flat-indexed cell, scanning a
// fresh `shuffle4Directions(rng)` order. Returns null if all 4 directions
// land out of bounds (degenerate — only happens when size < 1; sizes 3+
// always have at least one in-bounds direction).
//
// Caller decides what to do with the result:
//   - "stay put on OOB":  `if (n === null) continue;` (Aldous-Broder)
//   - "skip this step":   `if (n === null) continue;`  (Wilson's walk)
//   - "try next dir":     `if (n === null) { /* all-OOB fallback */ }`
//   (All three are the same code path; the semantic difference lives in
//    what the caller does AFTER this returns a valid in-bounds neighbor.)
export function randomFlatNeighbor(
  idx: number,
  size: number,
  rng: () => number,
): { nx: number; nz: number } | null {
  const cx = idx % size;
  const cz = Math.floor(idx / size);
  for (const { dx, dz } of shuffle4Directions(rng)) {
    const nx = cx + dx;
    const nz = cz + dz;
    if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue;
    return { nx, nz };
  }
  return null;
}
