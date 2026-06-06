import type { MazeData, Pickup } from '../maze/types';

export function isAtExit(player: { x: number; z: number }, maze: MazeData): boolean {
  const cs = maze.cellSize;
  const cellX = Math.round((player.x - cs / 2) / cs);
  const cellZ = Math.round((player.z - cs / 2) / cs);
  return cellX === maze.exit.x && cellZ === maze.exit.z;
}

export function findPickupAt(player: { x: number; z: number }, maze: MazeData, remaining: Pickup[]): Pickup | null {
  const cs = maze.cellSize;
  const cellX = Math.round((player.x - cs / 2) / cs);
  const cellZ = Math.round((player.z - cs / 2) / cs);
  for (const p of remaining) {
    if (p.x === cellX && p.z === cellZ) return p;
  }
  return null;
}
