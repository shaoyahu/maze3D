import type { MazeData, Pickup } from '../maze/types';

// Cell convention: cell i owns [i*cs, (i+1)*cs). floor() matches Collision.
// collidesAt's convention. Round-based "nearest center" disagrees at exact
// boundaries, causing findPickupAt to miss one-frame boundary hits.
function cellX(point: { x: number }, cs: number) { return Math.floor(point.x / cs); }
function cellZ(point: { z: number }, cs: number) { return Math.floor(point.z / cs); }

export function crossesExit(
  start: { x: number; z: number },
  end: { x: number; z: number },
  maze: MazeData,
): boolean {
  // Sample start, end, and the midpoint so fast movement (dt spikes, debug
  // speed-up) cannot tunnel past the exit cell.
  const cs = maze.cellSize;
  const ex = maze.exit.x;
  const ez = maze.exit.z;
  if (cellX(start, cs) === ex && cellZ(start, cs) === ez) return true;
  if (cellX(end, cs) === ex && cellZ(end, cs) === ez) return true;
  const midX = Math.floor((start.x + end.x) / 2 / cs);
  const midZ = Math.floor((start.z + end.z) / 2 / cs);
  return midX === ex && midZ === ez;
}

export function findPickupAt(player: { x: number; z: number }, maze: MazeData, remaining: Pickup[]): Pickup | null {
  const cs = maze.cellSize;
  const px = cellX(player, cs);
  const pz = cellZ(player, cs);
  for (const p of remaining) {
    if (p.x === px && p.z === pz) return p;
  }
  return null;
}

// P2-2 #10: useItem handler. Pure function over (slot, inventory, maze) —
// the store action calls it and reacts to the result. In the current
// no-lock world the only effect is a UI flash; future P2-4a lock cells
// would be resolved here and `consumed` would flip to true once a key
// opens a door.
export interface UseItemResult {
  flash: boolean;
  consumed: boolean;
}

export function onUseItem(
  slot: 0 | 1,
  inventory: (Pickup | null)[],
  maze: MazeData | null,
): UseItemResult {
  if (!maze) return { flash: false, consumed: false };
  if (slot < 0 || slot >= inventory.length) return { flash: false, consumed: false };
  if (!inventory[slot]) return { flash: false, consumed: false };
  return { flash: true, consumed: false };
}
