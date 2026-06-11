import { LevelLoadError } from '../utils/errors';
import { PLAYER_RADIUS } from '../entities/Player';
import { generateId } from '../utils/id';
import type { MazeData, MazeProvider, CellType, PickupType, VictoryType, EnemySpawn } from './types';

const VALID_PICKUP_TYPES: PickupType[] = ['time', 'health', 'key'];
const VALID_VICTORY: VictoryType[] = ['reach-exit', 'survive', 'time-trial'];
// Derived from the player's collision radius — the player needs 2*radius of
// clearance to fit inside a single cell. Importing PLAYER_RADIUS keeps the
// validator in lockstep with Player.createPlayer: a future radius change
// automatically tightens or loosens the level-size floor.
const MIN_CELL_SIZE = 2 * PLAYER_RADIUS;

export type MazeLoader = () => Promise<unknown>;

export class JsonMazeProvider implements MazeProvider {
  // Each entry is either a pre-validated data object (eager) or a loader
  // function that returns a promise of the data (lazy). The constructor
  // accepts both so callers can pick the trade-off: eager for tests, lazy
  // for production so level JSONs are parsed on demand.
  constructor(private data: Record<string, unknown | MazeLoader>) {}

  async list(): Promise<string[]> {
    return Object.keys(this.data);
  }

  async load(id: string): Promise<MazeData> {
    const entry = this.data[id];
    if (entry === undefined) throw new LevelLoadError(`Maze '${id}' not found`);
    let raw: unknown;
    try {
      raw = typeof entry === 'function' ? await (entry as MazeLoader)() : entry;
    } catch (e) {
      throw new LevelLoadError(
        `Maze '${id}': failed to load — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return validateMaze(raw, id);
  }
}

export function validateMaze(raw: unknown, id: string): MazeData {
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
  if (!Number.isFinite(m.cellSize as number) || (m.cellSize as number) <= 0) {
    throw new LevelLoadError(`Maze '${id}': cellSize must be a finite positive number`);
  }
  if ((m.cellSize as number) < MIN_CELL_SIZE) {
    throw new LevelLoadError(`Maze '${id}': cellSize must be at least ${MIN_CELL_SIZE} to fit the player`);
  }

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

  requireInBounds(start, 'x', 'z', `${id}.start`, width, depth);
  requireInBounds(exit, 'x', 'z', `${id}.exit`, width, depth);
  if (walls[start.z as number][start.x as number] === 1) {
    throw new LevelLoadError(`Maze '${id}': start is on a wall`);
  }
  if (walls[exit.z as number][exit.x as number] === 1) {
    throw new LevelLoadError(`Maze '${id}': exit is on a wall`);
  }
  // F6: the player would spawn on the exit cell, so `crossesExit`
  // fires on tick 0 and `reachExit` records a 0-second victory.
  if (start.x === exit.x && start.z === exit.z) {
    throw new LevelLoadError(`Maze '${id}': start and exit are on the same cell`);
  }

  const pickups = Array.isArray(m.pickups) ? m.pickups : [];
  const seenCells = new Set<string>();
  // P2-4b backward compat: hand-crafted JSON levels saved before Pickup.id
  // existed have no `id` field. We mint a UUID here so the resulting
  // MazeData satisfies the new required field, and the editor can later
  // refer to the pickup by id. Explicit ids are preserved verbatim.
  const normalizedPickups: Array<Record<string, unknown>> = [];
  for (const p of pickups) {
    if (typeof p !== 'object' || p === null) {
      throw new LevelLoadError(`Maze '${id}': invalid pickup`);
    }
    const pp = p as Record<string, unknown>;
    requireNumber(pp, 'x', `${id}.pickup`);
    requireNumber(pp, 'z', `${id}.pickup`);
    requireNumber(pp, 'value', `${id}.pickup`);
    if (!Number.isFinite(pp.value as number) || (pp.value as number) <= 0) {
      throw new LevelLoadError(`Maze '${id}': pickup value must be a finite positive number`);
    }
    requireInBounds(pp, 'x', 'z', `${id}.pickup`, width, depth);
    if (!VALID_PICKUP_TYPES.includes(pp.type as PickupType)) {
      throw new LevelLoadError(`Maze '${id}': invalid pickup type`);
    }
    if (pp.x === (m.start as Record<string, unknown>).x && pp.z === (m.start as Record<string, unknown>).z) {
      throw new LevelLoadError(`Maze '${id}': pickup is on the start cell`);
    }
    if (walls[pp.z as number][pp.x as number] === 1) {
      throw new LevelLoadError(`Maze '${id}': pickup is on a wall`);
    }
    const cellKey = `${pp.x},${pp.z}`;
    if (seenCells.has(cellKey)) {
      throw new LevelLoadError(`Maze '${id}': duplicate pickup at (${pp.x}, ${pp.z})`);
    }
    seenCells.add(cellKey);
    const pickupId = typeof pp.id === 'string' && pp.id.length > 0 ? pp.id : generateId();
    // Preserve all the original fields; only inject the id when missing.
    normalizedPickups.push({ ...pp, id: pickupId });
  }

  requireObject(m, 'rules', id);
  const r = m.rules as Record<string, unknown>;
  requireNumber(r, 'initialTime', `${id}.rules`);
  requireNumber(r, 'maxHealth', `${id}.rules`);
  requireNumber(r, 'timeOnPickup', `${id}.rules`);
  const initialTime = r.initialTime as number;
  const maxHealth = r.maxHealth as number;
  const timeOnPickup = r.timeOnPickup as number;
  if (!(initialTime > 0) || !Number.isFinite(initialTime)) {
    throw new LevelLoadError(`Maze '${id}': initialTime must be a finite positive number`);
  }
  if (!(maxHealth > 0) || !Number.isFinite(maxHealth)) {
    throw new LevelLoadError(`Maze '${id}': maxHealth must be a finite positive number`);
  }
  if (!Number.isFinite(timeOnPickup) || timeOnPickup <= 0) {
    throw new LevelLoadError(`Maze '${id}': timeOnPickup must be a finite positive number`);
  }
  if (!VALID_VICTORY.includes(r.victory as VictoryType)) {
    throw new LevelLoadError(`Maze '${id}': invalid victory type`);
  }

  const enemies = parseEnemies(m.enemies, id, width, depth, walls);

  return { ...m, pickups: normalizedPickups, enemies } as unknown as MazeData;
}

// Returns [] when the field is missing or not an array, drops any enemy
// whose path has fewer than 2 nodes (with a console.warn so a bad hand-
// crafted level doesn't silently lose enemies at runtime), and otherwise
// builds a strictly-typed EnemySpawn for each entry. Spawn x/z and every
// patrol-path node must be in-bounds and on a walkable cell — the engine
// itself only checks spawn-vs-wall, so anything looser here would let
// a node render outside the grid (F7).
function parseEnemies(raw: unknown, id: string, width: number, depth: number, walls: CellType[][]): EnemySpawn[] {
  if (!Array.isArray(raw)) return [];
  const out: EnemySpawn[] = [];
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i];
    if (typeof e !== 'object' || e === null) {
      throw new LevelLoadError(`Maze '${id}': invalid enemy at index ${i}`);
    }
    const ee = e as Record<string, unknown>;
    requireString(ee, 'id', `${id}.enemies[${i}]`);
    requireNumber(ee, 'x', `${id}.enemies[${i}]`);
    requireNumber(ee, 'z', `${id}.enemies[${i}]`);
    requireInBounds(ee, 'x', 'z', `${id}.enemies[${i}]`, width, depth);

    if (!Array.isArray(ee.path)) {
      throw new LevelLoadError(`Maze '${id}': enemy ${ee.id} path must be array`);
    }
    const path: Array<{ x: number; z: number }> = [];
    for (let j = 0; j < ee.path.length; j++) {
      const node = ee.path[j];
      if (typeof node !== 'object' || node === null) {
        throw new LevelLoadError(`Maze '${id}': enemy ${ee.id} path[${j}] must be an object`);
      }
      const nn = node as Record<string, unknown>;
      // F7: requireNumber allowed {x:99,z:-2} and {x:1.5,z:1} to slip
      // through, putting patrol nodes outside the grid or on a
      // non-integer cell (breaking the floor(x/cs) agreement with the
      // cell-center positioning). requireInBounds enforces integer +
      // 0<=x<w, 0<=z<d; the walkability check rejects nodes that sit
      // on a wall.
      requireInBounds(nn, 'x', 'z', `${id}.enemies[${i}].path[${j}]`, width, depth);
      if (walls[nn.z as number][nn.x as number] === 1) {
        throw new LevelLoadError(`Maze '${id}': enemy ${ee.id} path[${j}] is on a wall`);
      }
      path.push({ x: nn.x as number, z: nn.z as number });
    }
    if (path.length < 2) {
      console.warn(
        `Maze '${id}': enemy ${ee.id as string} has ${path.length} path node(s); needs >= 2 — excluded`,
      );
      continue;
    }

    const spawn: EnemySpawn = {
      id: ee.id as string,
      x: ee.x as number,
      z: ee.z as number,
      path,
    };
    if (typeof ee.dwellTime === 'number' && Number.isFinite(ee.dwellTime)) {
      spawn.dwellTime = ee.dwellTime;
    }
    if (typeof ee.fovRange === 'number' && Number.isFinite(ee.fovRange)) {
      spawn.fovRange = ee.fovRange;
    }
    if (typeof ee.fovAngleDeg === 'number' && Number.isFinite(ee.fovAngleDeg)) {
      spawn.fovAngleDeg = ee.fovAngleDeg;
    }
    out.push(spawn);
  }
  return out;
}

function requireString(o: Record<string, unknown>, key: string, ctx: string) {
  if (typeof o[key] !== 'string') throw new LevelLoadError(`Maze '${ctx}': missing string '${key}'`);
}
function requireNumber(o: Record<string, unknown>, key: string, ctx: string) {
  // typeof NaN === 'number' and typeof Infinity === 'number', so the plain
  // typeof check is insufficient — a JSON pipeline that produces NaN for
  // missing fields would otherwise slip through and surface as "depth (NaN)"
  // errors far from the root cause.
  if (typeof o[key] !== 'number' || !Number.isFinite(o[key] as number)) {
    throw new LevelLoadError(`Maze '${ctx}': missing or non-finite number '${key}'`);
  }
}
function requireObject(o: Record<string, unknown>, key: string, ctx: string) {
  if (typeof o[key] !== 'object' || o[key] === null) {
    throw new LevelLoadError(`Maze '${ctx}': missing object '${key}'`);
  }
}
function requireInBounds(o: Record<string, unknown>, xKey: string, zKey: string, ctx: string, w: number, d: number) {
  const x = o[xKey] as number;
  const z = o[zKey] as number;
  // Integer requirement: the cell convention (floor(x/cs)) only agrees with
  // the cell-center positioning (start.x * cs + cs/2) when start.x is an
  // integer. Fractional coordinates would put the player mid-cell, causing
  // the runtime cell index to disagree with the validation-time cell index
  // and making integer-cell pickups unreachable.
  if (!Number.isInteger(x) || !Number.isInteger(z) || !(x >= 0 && x < w && z >= 0 && z < d)) {
    throw new LevelLoadError(`Maze '${ctx}': (${xKey}=${x}, ${zKey}=${z}) out of bounds or non-integer (width=${w}, depth=${d})`);
  }
}
