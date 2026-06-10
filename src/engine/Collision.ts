export interface WallGrid {
  width: number;
  depth: number;
  cellSize: number;
  get(x: number, z: number): 0 | 1;
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

export function resolveMove(
  p: PlayerPos,
  d: Delta,
  grid: WallGrid,
): { x: number; z: number } {
  let { x, z, r } = p;
  // Resolve X axis
  const newX = x + d.dx;
  if (!collidesAt(newX, z, r, grid)) x = newX;
  // Resolve Z axis
  const newZ = z + d.dz;
  if (!collidesAt(x, newZ, r, grid)) z = newZ;
  return { x, z };
}

export interface EnemyPos {
  x: number;
  z: number;
  r: number;
}

// Top-down circle-vs-circle check. The enemy is a 3D capsule of height
// 1.6m / radius 0.35m, but the game resolves collisions at ground level
// (y=0), so the projection is a circle; passing a 0 height is implicit.
export function playerVsEnemy(
  playerPos: { x: number; z: number },
  playerRadius: number,
  enemy: EnemyPos,
): boolean {
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
export function hasEnemyContact(
  playerPos: { x: number; z: number },
  playerRadius: number,
  enemies: ReadonlyArray<{ x: number; z: number }>,
  enemyRadius: number,
): boolean {
  for (const e of enemies) {
    if (playerVsEnemy(playerPos, playerRadius, { x: e.x, z: e.z, r: enemyRadius })) {
      return true;
    }
  }
  return false;
}

function collidesAt(
  px: number,
  pz: number,
  r: number,
  grid: WallGrid,
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
      if (grid.get(cx, cz) === 1) {
        return true;
      }
    }
  }
  return false;
}
