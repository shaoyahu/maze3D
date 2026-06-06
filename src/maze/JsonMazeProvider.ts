import { LevelLoadError } from '../utils/errors';
import type { MazeData, MazeProvider, CellType, PickupType, VictoryType } from './types';

const VALID_PICKUP_TYPES: PickupType[] = ['time', 'health', 'key'];
const VALID_VICTORY: VictoryType[] = ['reach-exit', 'survive', 'time-trial'];

export class JsonMazeProvider implements MazeProvider {
  constructor(private data: Record<string, unknown>) {}

  async list(): Promise<string[]> {
    return Object.keys(this.data);
  }

  async load(id: string): Promise<MazeData> {
    const raw = this.data[id];
    if (!raw) throw new LevelLoadError(`Maze '${id}' not found`);
    return validateMaze(raw, id);
  }
}

function validateMaze(raw: unknown, id: string): MazeData {
  if (typeof raw !== 'object' || raw === null) {
    throw new LevelLoadError(`Maze '${id}' is not an object`);
  }
  const m = raw as Record<string, unknown>;

  requireString(m, 'id', id);
  requireString(m, 'name', id);
  requireObject(m, 'size', id);
  const size = m.size as Record<string, unknown>;
  requireNumber(size, 'width', `${id}.size`);
  requireNumber(size, 'depth', `${id}.size`);
  requireNumber(m, 'cellSize', id);

  requireObject(m, 'start', id);
  const start = m.start as Record<string, unknown>;
  requireNumber(start, 'x', `${id}.start`);
  requireNumber(start, 'z', `${id}.start`);

  requireObject(m, 'exit', id);
  const exit = m.exit as Record<string, unknown>;
  requireNumber(exit, 'x', `${id}.exit`);
  requireNumber(exit, 'z', `${id}.exit`);

  if (!Array.isArray(m.walls)) throw new LevelLoadError(`Maze '${id}': walls must be array`);
  const width = size.width as number;
  const depth = size.depth as number;
  if (m.walls.length !== depth) {
    throw new LevelLoadError(`Maze '${id}': walls row count (${m.walls.length}) does not match depth (${depth})`);
  }
  const walls: CellType[][] = [];
  for (let z = 0; z < depth; z++) {
    const row = m.walls[z];
    if (!Array.isArray(row) || row.length !== width) {
      throw new LevelLoadError(`Maze '${id}': walls[${z}] length does not match width (${width})`);
    }
    const cells: CellType[] = [];
    for (let x = 0; x < width; x++) {
      const v = row[x];
      if (v !== 0 && v !== 1) {
        throw new LevelLoadError(`Maze '${id}': walls[${z}][${x}] must be 0 or 1 (got ${v})`);
      }
      cells.push(v as CellType);
    }
    walls.push(cells);
  }

  if (walls[start.z as number][start.x as number] === 1) {
    throw new LevelLoadError(`Maze '${id}': start is on a wall`);
  }
  if (walls[exit.z as number][exit.x as number] === 1) {
    throw new LevelLoadError(`Maze '${id}': exit is on a wall`);
  }

  const pickups = Array.isArray(m.pickups) ? m.pickups : [];
  for (const p of pickups) {
    if (typeof p !== 'object' || p === null) {
      throw new LevelLoadError(`Maze '${id}': invalid pickup`);
    }
    const pp = p as Record<string, unknown>;
    if (typeof pp.x !== 'number' || typeof pp.z !== 'number') {
      throw new LevelLoadError(`Maze '${id}': pickup missing x/z`);
    }
    if (!VALID_PICKUP_TYPES.includes(pp.type as PickupType)) {
      throw new LevelLoadError(`Maze '${id}': invalid pickup type`);
    }
    if (walls[pp.z as number][pp.x as number] === 1) {
      throw new LevelLoadError(`Maze '${id}': pickup is on a wall`);
    }
  }

  requireObject(m, 'rules', id);
  const r = m.rules as Record<string, unknown>;
  requireNumber(r, 'initialTime', `${id}.rules`);
  requireNumber(r, 'maxHealth', `${id}.rules`);
  requireNumber(r, 'timeOnPickup', `${id}.rules`);
  if (!VALID_VICTORY.includes(r.victory as VictoryType)) {
    throw new LevelLoadError(`Maze '${id}': invalid victory type`);
  }

  return m as unknown as MazeData;
}

function requireString(o: Record<string, unknown>, key: string, ctx: string) {
  if (typeof o[key] !== 'string') throw new LevelLoadError(`Maze '${ctx}': missing string '${key}'`);
}
function requireNumber(o: Record<string, unknown>, key: string, ctx: string) {
  if (typeof o[key] !== 'number') throw new LevelLoadError(`Maze '${ctx}': missing number '${key}'`);
}
function requireObject(o: Record<string, unknown>, key: string, ctx: string) {
  if (typeof o[key] !== 'object' || o[key] === null) {
    throw new LevelLoadError(`Maze '${ctx}': missing object '${key}'`);
  }
}
