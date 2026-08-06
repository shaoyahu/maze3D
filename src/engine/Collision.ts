// P3-1: per-layer wall grid. Pre-P3-1 collision ignored `level` entirely
// — there was only one layer. The Collision module now threads a `level`
// argument through WallGrid.get / resolveMove / collidesAt so a single
// shared wall-grid object can serve all N layers, and so player-vs-enemy
// contact checks only collide when the player and the enemy are on the
// same layer (per spec §5.3 + H2: "玩家同层才 collision").
//
// Back-compat contract: when `levelCount === 1`, every caller passes
// `level = 0` and the module behaves exactly like the pre-P3-1
// single-layer implementation. The existing test suite
// (tests/unit/collision.test.ts) continues to pass with one signature
// update — the `get` closure now takes an explicit `level` argument
// that the existing tests pass `0` for.

export interface WallGrid {
  width: number;
  depth: number;
  cellSize: number;
  // P3-1: read the cell at (x, z) on the given layer. Implementations
  // backed by a single 2D grid (the pre-P3-1 / levelCount=1 case) can
  // ignore `level`; multi-level implementations index into a
  // per-layer array. The `level` parameter is mandatory at the call
  // sites (`resolveMove` / `collidesAt`) so the typechecker keeps
  // every collision path honest — passing `undefined` to slip the
  // back-compat shim is no longer available.
  get(x: number, z: number, level: number): 0 | 1;
}

export interface PlayerPos {
  x: number;
  z: number;
  r: number;
}

export interface Delta {
  dx: number;
  dz: number;
}

// P3-1: `level` is the player's current layer. The wall lookup
// happens against that layer's grid only — a wall on a different
// layer doesn't block the player. For levelCount === 1, callers
// pass `level = 0` and the behavior is identical to the pre-P3-1
// implementation.
export function resolveMove(
  p: PlayerPos,
  d: Delta,
  grid: WallGrid,
  level: number,
): { x: number; z: number } {
  let { x, z, r } = p;
  // Resolve X axis
  const newX = x + d.dx;
  if (!collidesAt(newX, z, r, grid, level)) x = newX;
  // Resolve Z axis
  const newZ = z + d.dz;
  if (!collidesAt(x, newZ, r, grid, level)) z = newZ;
  return { x, z };
}

export interface EnemyPos {
  x: number;
  z: number;
  r: number;
  // P3-1: which layer the enemy is pinned to. Pre-P3-1 levels have
  // no `level` field; JsonMazeProvider defaults it to 0, so a
  // missing field is treated as layer 0 (single-layer back-compat).
  // Spec §5.3 / H2: a player on a different layer never collides
  // with an enemy on this layer.
  level?: number;
}

// Top-down circle-vs-circle check. The enemy is a 3D capsule of height
// 1.6m / radius 0.35m, but the game resolves collisions at ground level
// (y=0), so the projection is a circle; passing a 0 height is implicit.
//
// P3-1: the player and the enemy must be on the same layer for the
// contact to count. The single-layer back-compat (levelCount=1) is
// preserved by treating `enemy.level === undefined` as 0.
export function playerVsEnemy(
  playerPos: { x: number; z: number },
  playerRadius: number,
  enemy: EnemyPos,
  playerLevel: number,
): boolean {
  // P3-1: cross-layer enemies never collide with the player. The
  // strict-equality (rather than abs(diff) === 0) is intentional —
  // the spec lets enemies patrol within ONE layer, not multiple.
  if ((enemy.level ?? 0) !== playerLevel) return false;
  const dx = enemy.x - playerPos.x;
  const dz = enemy.z - playerPos.z;
  const sumR = playerRadius + enemy.r;
  return dx * dx + dz * dz < sumR * sumR;
}

// P2-4a F1: per-frame "is the player touching ANY enemy?" check used by
// Game.update() to fire bridge.onEnemyContact. Returns true the moment
// one enemy overlaps the player. The 0.5s invulnerable window lives in
// the store (gameStore.damage), so this helper does NOT debounce — the
// engine fires onEnemyContact(1) every frame the player is in contact,
// and the store collapses the burst. Centralizing the loop here keeps
// Game.update() glue-only and lets the rule be unit-tested without
// Three.js / WebGL.
//
// P3-1: the `enemies` array's items now carry an optional `level`
// field; `playerLevel` is the player's current layer. Enemies on a
// different layer are silently skipped — the spec models the world
// as N independent 2D planes stacked vertically, so a player
// walking L0 cannot touch an enemy on L1.
export function hasEnemyContact(
  playerPos: { x: number; z: number },
  playerRadius: number,
  enemies: ReadonlyArray<{ x: number; z: number; level?: number }>,
  enemyRadius: number,
  playerLevel: number,
): boolean {
  for (const e of enemies) {
    if (
      playerVsEnemy(
        playerPos,
        playerRadius,
        { x: e.x, z: e.z, r: enemyRadius, level: e.level },
        playerLevel,
      )
    ) {
      return true;
    }
  }
  return false;
}

// P3-1: `level` is threaded through. The OOB check is per-layer — a
// coordinate outside the grid on layer L still means "blocked",
// matching the pre-P3-1 single-layer semantics when only layer 0
// exists.
function collidesAt(
  px: number,
  pz: number,
  r: number,
  grid: WallGrid,
  level: number,
): boolean {
  const cs = grid.cellSize;
  const minCellX = Math.floor((px - r) / cs);
  const maxCellX = Math.floor((px + r) / cs);
  const minCellZ = Math.floor((pz - r) / cs);
  const maxCellZ = Math.floor((pz + r) / cs);
  for (let cz = minCellZ; cz <= maxCellZ; cz++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      if (cx < 0 || cz < 0 || cx >= grid.width || cz >= grid.depth) {
        return true; // out of bounds = wall, prevents walking off the map
      }
      if (grid.get(cx, cz, level) === 1) {
        return true;
      }
    }
  }
  return false;
}
