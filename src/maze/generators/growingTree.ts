import { expandThickWall, type TreeEdge } from './_expandThickWall';
import type { CellType } from '../types';

// Default strategy: pick the newest cell (= Recursive Backtracker).
const DEFAULT_STRATEGY_SPEC = 'newest:100';

export function generateGrowingTree(
  visualSize: number,
  rng: () => number,
  strategySpec: string = DEFAULT_STRATEGY_SPEC,
): CellType[][] {
  const logicalSize = Math.ceil(visualSize / 2);
  const treeEdges = buildGrowingTreeTree(logicalSize, rng, strategySpec);
  return expandThickWall(visualSize, treeEdges);
}

function buildGrowingTreeTree(
  size: number,
  rng: () => number,
  strategySpec: string,
): TreeEdge[] {
  const pickIndex = parseStrategy(strategySpec, rng);
  const visited = new Uint8Array(size * size);
  // Active list: flat indices (z * size + x). order matters for newest/oldest.
  const active: number[] = [];
  const tree: TreeEdge[] = [];

  // Seed: start at (0, 0).
  visited[0] = 1;
  active.push(0);

  while (active.length > 0) {
    const idx = pickIndex(active);
    const flat = active[idx];
    const x = flat % size;
    const z = Math.floor(flat / size);

    // Collect unvisited neighbors.
    const unvisited: Array<{ x: number; z: number }> = [];
    if (x + 1 < size && !visited[z * size + x + 1]) unvisited.push({ x: x + 1, z });
    if (x - 1 >= 0 && !visited[z * size + x - 1]) unvisited.push({ x: x - 1, z });
    if (z + 1 < size && !visited[(z + 1) * size + x]) unvisited.push({ x, z: z + 1 });
    if (z - 1 >= 0 && !visited[(z - 1) * size + x]) unvisited.push({ x, z: z - 1 });

    if (unvisited.length > 0) {
      const next = unvisited[Math.floor(rng() * unvisited.length)];
      tree.push({ ax: x, az: z, bx: next.x, bz: next.z });
      visited[next.z * size + next.x] = 1;
      active.push(next.z * size + next.x);
    } else {
      // No unvisited neighbors: remove from active.
      active.splice(idx, 1);
    }
  }
  return tree;
}

// ---------------------------------------------------------------------------
// Strategy parsing
// ---------------------------------------------------------------------------

type PickIndex = (active: number[]) => number;
type Rng = () => number;

// Parse a strategy spec like "newest:50,random:50" into a function that
// picks an index from the active list. Unknown strategies and invalid
// weights are skipped with a console.warn; if the spec is empty or all
// parts are invalid, fall back to "newest:100".
//
// Supported strategies:
//   newest:N  — pick the most-recently-added cell (probability N% per call;
//                with N=100 this is Recursive Backtracker).
//   random:N  — pick a uniformly-random cell (probability N% per call; with
//                N=100 this is equivalent to Prim's algorithm in behavior).
//   oldest:N  — pick the earliest-added cell still in active.
//   middle:N  — pick the cell at index floor(active.length / 2).
//
// Multiple strategies are comma-delimited; their weights need not sum to
// 100 — the last strategy in the list catches any unallocated probability.
export function parseStrategy(spec: string, rng: Rng): PickIndex {
  type Weight = { strategy: 'newest' | 'random' | 'oldest' | 'middle'; weight: number };
  const weights: Weight[] = [];
  let total = 0;
  if (typeof spec === 'string' && spec.trim().length > 0) {
    for (const part of spec.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx <= 0) {
        console.warn(`GrowingTree: invalid spec part ${JSON.stringify(trimmed)}; expected "strategy:weight", falling back to "newest:100"`);
        continue;
      }
      const strategy = trimmed.slice(0, colonIdx);
      const weightStr = trimmed.slice(colonIdx + 1);
      const weight = Number.parseInt(weightStr, 10);
      if (!Number.isFinite(weight) || weight < 0) {
        console.warn(`GrowingTree: invalid weight ${JSON.stringify(weightStr)} in ${JSON.stringify(trimmed)}; skipping`);
        continue;
      }
      if (strategy !== 'newest' && strategy !== 'random' && strategy !== 'oldest' && strategy !== 'middle') {
        console.warn(`GrowingTree: unknown strategy ${JSON.stringify(strategy)}; skipping`);
        continue;
      }
      weights.push({ strategy, weight });
      total += weight;
    }
  }
  if (total === 0) {
    weights.push({ strategy: 'newest', weight: 100 });
    total = 100;
  }
  // Pre-compute the cumulative boundaries for the strategy pick.
  const boundaries: number[] = [];
  let acc = 0;
  for (const w of weights) {
    acc += w.weight;
    boundaries.push(acc);
  }
  // Resolve which strategy was picked for a given rng() value.
  const resolveStrategy = (): Weight['strategy'] => {
    const r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      if (r < boundaries[i]) return weights[i].strategy;
    }
    return weights[weights.length - 1].strategy;
  };
  return (active: number[]): number => {
    const strategy = resolveStrategy();
    switch (strategy) {
      case 'newest':
        return active.length - 1;
      case 'oldest':
        return 0;
      case 'middle':
        return Math.floor(active.length / 2);
      case 'random':
        return Math.floor(rng() * active.length);
    }
  };
}
