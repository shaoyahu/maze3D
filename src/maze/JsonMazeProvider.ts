import { LevelLoadError, clampErrorValue } from '../utils/errors';
import { PLAYER_RADIUS } from '../entities/Player';
import { generateId } from '../utils/id';
import type {
  CellType,
  EnemySpawn,
  LevelRules,
  MazeData,
  MazeProvider,
  Pickup,
} from './types';
import { isPickupType, isVictoryType } from './types';

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
  // D-19: the caller's `id` (e.g. derived from the path
  // "/public/levels/level-tiny.json" → "level-tiny") must match the
  // JSON's own `id` field. Without this cross-check a misnamed fixture
  // would silently load via the path-derived id; the error surfaced at
  // use time would name the path-derived id and read "Maze 'level-other':
  // missing string 'id'" — confusing because `id` IS present, just
  // under a different name. The check below fires at module-load time
  // (built-in provider) or import time (user import) with a clear
  // message naming both ids.
  if (m.id !== id) {
    throw new LevelLoadError(
      `Maze '${id}': filename/loader id does not match level id '${clampErrorValue(m.id)}'`,
    );
  }
  requireString(m, 'name', id);
  requireObject(m, 'size', id);
  const size = m.size as Record<string, unknown>;
  // F-L11 / F-D-quality-D-6: requireNumber already validates and returns
  // a typed `number`; capture it instead of re-reading `size.width as
  // number` later (which would silently work even if `requireNumber` was
  // skipped by a refactor). The `width`/`depth` constants below are the
  // single source of truth for the rest of the function.
  const width = requireNumber(size, 'width', `${id}.size`);
  const depth = requireNumber(size, 'depth', `${id}.size`);
  const cellSize = requireNumber(m, 'cellSize', id);
  if (cellSize <= 0) {
    throw new LevelLoadError(`Maze '${id}': cellSize must be a finite positive number`);
  }
  if (cellSize < MIN_CELL_SIZE) {
    throw new LevelLoadError(`Maze '${id}': cellSize must be at least ${MIN_CELL_SIZE} to fit the player`);
  }
  // F-2026-06-15-H-3.4: removed two duplicate `if (!Number.isFinite(m.cellSize as
  // number) || ...)` branches that were unreachable dead code — requireNumber
  // already guarantees cellSize is a finite number, and the `as number` casts
  // they introduced bypassed the type system. Real validation lives in the
  // two ifs above.

  requireObject(m, 'start', id);
  const start = m.start as Record<string, unknown>;
  requireNumber(start, 'x', `${id}.start`);
  requireNumber(start, 'z', `${id}.start`);

  requireObject(m, 'exit', id);
  const exit = m.exit as Record<string, unknown>;
  requireNumber(exit, 'x', `${id}.exit`);
  requireNumber(exit, 'z', `${id}.exit`);

  if (!Array.isArray(m.walls)) throw new LevelLoadError(`Maze '${id}': walls must be array`);
  // `width` / `depth` / `cellSize` captured at the top of the function
  // from requireNumber's return value; see D-6 comment at the size block.
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
        throw new LevelLoadError(`Maze '${id}': walls[${z}][${x}] must be 0 or 1 (got ${clampErrorValue(v)})`);
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
  //
  // F-D-quality-D-7 + D-15: normalizedPickups is typed as `Pickup[]` from
  // the start (each validated field is assigned by name) so the final
  // MazeData literal can use it directly without an `as unknown as
  // Pickup[]` cast.
  const normalizedPickups: Pickup[] = [];
  for (const p of pickups) {
    if (typeof p !== 'object' || p === null) {
      throw new LevelLoadError(`Maze '${id}': invalid pickup`);
    }
    const pp = p as Record<string, unknown>;
    const px = requireNumber(pp, 'x', `${id}.pickup`);
    const pz = requireNumber(pp, 'z', `${id}.pickup`);
    const pvalue = requireNumber(pp, 'value', `${id}.pickup`);
    if (pvalue <= 0) {
      throw new LevelLoadError(`Maze '${id}': pickup value must be a finite positive number`);
    }
    requireInBounds({ x: px, z: pz }, 'x', 'z', `${id}.pickup`, width, depth);
    // F-D-quality-D-7: type guard instead of local VALID_PICKUP_TYPES
    // array; the runtime whitelist now lives once in src/maze/types.ts.
    if (!isPickupType(pp.type)) {
      throw new LevelLoadError(`Maze '${id}': invalid pickup type`);
    }
    if (px === start.x && pz === start.z) {
      throw new LevelLoadError(`Maze '${id}': pickup is on the start cell`);
    }
    // F-N10: also reject pickup on the exit cell. Without this, the
    // player would collect the pickup and immediately win on the same
    // frame (findPickupAt fires before crossesExit), earning the pickup
    // for free. Mirrors the start-cell check above.
    if (px === exit.x && pz === exit.z) {
      throw new LevelLoadError(`Maze '${id}': pickup is on the exit cell`);
    }
    if (walls[pz][px] === 1) {
      throw new LevelLoadError(`Maze '${id}': pickup is on a wall`);
    }
    const cellKey = `${px},${pz}`;
    if (seenCells.has(cellKey)) {
      throw new LevelLoadError(`Maze '${id}': duplicate pickup at (${px}, ${pz})`);
    }
    seenCells.add(cellKey);
    const pickupId = typeof pp.id === 'string' && pp.id.length > 0 ? pp.id : generateId();
    // F-D-quality-D-15: build a typed Pickup literal instead of spreading
    // the raw Record. isPickupType above narrows pp.type to PickupType;
    // every other field has been validated by requireNumber.
    normalizedPickups.push({ id: pickupId, x: px, z: pz, type: pp.type, value: pvalue });
  }

  requireObject(m, 'rules', id);
  const r = m.rules as Record<string, unknown>;
  // F-L11 / F-D-quality-D-6: capture requireNumber return; the values
  // are already non-NaN + finite so the redundant `Number.isFinite`
  // checks collapse into a single `> 0` test (the catch in requireNumber
  // would have thrown on NaN / Infinity before we got here).
  const initialTime = requireNumber(r, 'initialTime', `${id}.rules`);
  const maxHealth = requireNumber(r, 'maxHealth', `${id}.rules`);
  const timeOnPickup = requireNumber(r, 'timeOnPickup', `${id}.rules`);
  if (initialTime <= 0) {
    throw new LevelLoadError(`Maze '${id}': initialTime must be a finite positive number`);
  }
  if (maxHealth <= 0) {
    throw new LevelLoadError(`Maze '${id}': maxHealth must be a finite positive number`);
  }
  if (timeOnPickup <= 0) {
    throw new LevelLoadError(`Maze '${id}': timeOnPickup must be a finite positive number`);
  }
  // F-D-quality-D-7: route through the same type guard the UI uses
  // (src/maze/types.ts isVictoryType) so adding a new VictoryType literal
  // here automatically widens both layers.
  if (!isVictoryType(r.victory)) {
    throw new LevelLoadError(`Maze '${id}': invalid victory type`);
  }
  const rules: LevelRules = { initialTime, maxHealth, timeOnPickup, victory: r.victory };

  // F-2026-06-15-H-3.2: enemies is a required field per MazeData schema.
  // The previous code passed `m.enemies` directly to parseEnemies, which
  // silently coerced `undefined` to `[]`. A hand-written level missing
  // this field would load as a no-enemy survive run with no error — the
  // exact failure mode the schema is meant to prevent.
  if (!('enemies' in m)) {
    throw new LevelLoadError(`Maze '${id}': missing 'enemies' field (use [] for none)`);
  }
  const enemies = parseEnemies(m.enemies, id, width, depth, walls);

  // F-2026-06-17-D-CRITICAL-1: P2-11 added 5 fields to MazeData
  // (i18n, tutorialSteps, hideMinimap, rules.enemyAggression,
  // rules.requireAllPickups) but the original commit did not extend
  // the validator. With silent dropping, built-in teaching levels
  // loaded by JsonMazeProvider lost all P2-11 fields, so English
  // i18n, TutorialBanner, hideMinimap, and enemyAggression never
  // reached the runtime. The block below explicitly passes each
  // field through after type-narrowing; future P2-N fields should
  // be added here with the same shape (type-guard first, then
  // assign, no silent spread).
  let i18n: MazeData['i18n'];
  if (typeof m.i18n === 'object' && m.i18n !== null) {
    const rawI18n = m.i18n as Record<string, unknown>;
    const en = rawI18n.en;
    if (typeof en === 'string' && en.length > 0) {
      i18n = { en };
    }
  }
  let tutorialSteps: MazeData['tutorialSteps'];
  if (Array.isArray(m.tutorialSteps)) {
    tutorialSteps = m.tutorialSteps as NonNullable<MazeData['tutorialSteps']>;
  }
  const hideMinimap = typeof m.hideMinimap === 'boolean' ? m.hideMinimap : undefined;
  // P2-13: optional folderId for the editor's left-panel file tree.
  // Free-form string (validated only as "looks like an id"); the
  // editor's level store resolves the reference at render time, so a
  // dangling folderId just falls back to the default "我的" bucket.
  const folderId = typeof m.folderId === 'string' && m.folderId.length > 0 ? m.folderId : undefined;
  // rules.enemyAggression + rules.requireAllPickups are optional in
  // LevelRules; patch them in here from the raw record so the
  // validator never silently drops them.
  if (r.enemyAggression === 'easy' || r.enemyAggression === 'medium' || r.enemyAggression === 'hard') {
    rules.enemyAggression = r.enemyAggression;
  }
  if (r.requireAllPickups === true) {
    rules.requireAllPickups = true;
  }

  // F-D-quality-D-15: assemble the MazeData by name instead of `{ ...m,
  // ... } as unknown as MazeData`. Every field is validated above; the
  // literal here gives TypeScript the per-field types it needs to satisfy
  // the interface without an unchecked double-cast. `id` / `name` are
  // re-cast from the Record lookup because requireString only validates,
  // it does not narrow. start / exit stay typed as their validated
  // Record<string, unknown> shape since the loop bodies above never
  // mutate them after requireNumber; the per-field types flow through
  // when the literal is built.
  const maze: MazeData = {
    id: m.id as string,
    name: m.name as string,
    size: { width, depth },
    cellSize,
    start: { x: start.x as number, z: start.z as number },
    exit: { x: exit.x as number, z: exit.z as number },
    walls,
    pickups: normalizedPickups,
    rules,
    enemies,
    ...(i18n !== undefined ? { i18n } : {}),
    ...(tutorialSteps !== undefined ? { tutorialSteps } : {}),
    ...(hideMinimap !== undefined ? { hideMinimap } : {}),
    ...(folderId !== undefined ? { folderId } : {}),
  };
  return maze;
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
    // F-2026-06-15-H-3.3: the file-level comment claims spawn x/z must be
    // on a walkable cell, but the original code only enforced this for path
    // nodes — spawn itself was unchecked. A spawn on a wall renders the
    // enemy stuck inside collision geometry and freezes patrol AI.
    if (walls[ee.z as number][ee.x as number] === 1) {
      throw new LevelLoadError(`Maze '${id}': enemy ${clampErrorValue(ee.id)} spawn is on a wall`);
    }

    if (!Array.isArray(ee.path)) {
      throw new LevelLoadError(`Maze '${id}': enemy ${clampErrorValue(ee.id)} path must be array`);
    }
    const path: Array<{ x: number; z: number }> = [];
    for (let j = 0; j < ee.path.length; j++) {
      const node = ee.path[j];
      if (typeof node !== 'object' || node === null) {
        throw new LevelLoadError(`Maze '${id}': enemy ${clampErrorValue(ee.id)} path[${j}] must be an object`);
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
        throw new LevelLoadError(`Maze '${id}': enemy ${clampErrorValue(ee.id)} path[${j}] is on a wall`);
      }
      path.push({ x: nn.x as number, z: nn.z as number });
      // F-2026-06-17-C-H-2: reject duplicate consecutive path nodes. A
      // hand-crafted JSON with two equal nodes (e.g. {x:1,z:1} twice)
      // would cause Enemy.advanceTarget to step into a zero-distance
      // segment and fall through the headingToward fallback path on
      // every tick — visually the enemy jitters in place. The duplicate
      // is almost always a copy/paste mistake in the level file.
      if (path.length >= 2) {
        const last = path[path.length - 2]!;
        const curr = path[path.length - 1]!;
        if (last.x === curr.x && last.z === curr.z) {
          throw new LevelLoadError(
            `Maze '${id}': enemy ${clampErrorValue(ee.id)} path[${j}] duplicates the previous node`,
          );
        }
      }
      // F-2026-06-17-C-H-2: cap path length at 20 nodes. Defensive
      // guard against malicious / malformed JSON trying to allocate
      // huge paths. Existing built-in levels use 2–4 nodes; 20 is well
      // above any legitimate patrol and well below the threshold at
      // which Enemy.update per-frame work becomes noticeable.
      if (path.length > 20) {
        console.warn(`Maze '${id}': enemy ${ee.id as string} path has ${path.length} nodes; truncating to 20`);
        break;
      }
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
function requireNumber(o: Record<string, unknown>, key: string, ctx: string): number {
  // typeof NaN === 'number' and typeof Infinity === 'number', so the plain
  // typeof check is insufficient — a JSON pipeline that produces NaN for
  // missing fields would otherwise slip through and surface as "depth (NaN)"
  // errors far from the root cause. F-L11: return the typed `number` so
  // callers can drop the `as number` assertions and use the validated
  // value directly. Existing call sites discard the return; that's safe.
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new LevelLoadError(`Maze '${ctx}': missing or non-finite number '${key}'`);
  }
  return v;
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
