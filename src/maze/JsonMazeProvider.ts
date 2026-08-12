import { LevelLoadError, clampErrorValue } from '../utils/errors';
import { PLAYER_RADIUS } from '../entities/Player';
import { generateId } from '../utils/id';
import { validateTutorialSteps } from '../utils/tutorialValidator';
import type {
  CellType,
  EnemySpawn,
  LevelRules,
  MazeData,
  MazeProvider,
  Pickup,
  Trap,
  Door,
} from './types';
import { isPickupType, isVictoryType, isMinimapMode, isMapOpenBehavior, isParchmentLifecycle, isTrapKind, isKeyColor } from './types';

// Derived from the player's collision radius — the player needs 2*radius of
// clearance to fit inside a single cell. Importing PLAYER_RADIUS keeps the
// validator in lockstep with Player.createPlayer: a future radius change
// automatically tightens or loosens the level-size floor.
const MIN_CELL_SIZE = 2 * PLAYER_RADIUS;

// P3-1d (M-2 fix): host-side DoS guards. Without these, a malicious
// shared-link / import-file (JsonMazeProvider is the only validator
// between untrusted JSON and the in-memory MazeData) could OOM the
// tab by requesting a 10⁶×10⁶ grid, or by stuffing the entity arrays
// with millions of entries. The cap is generous (the largest legit
// level is 50×50, the largest legit multi-level is 6 layers of that
// — well under MAX_MAZE_SIZE * MAX_MAZE_SIZE * 6) and the error
// messages name the offending field so a malformed fixture can be
// diagnosed without guessing.
const MAX_MAZE_SIZE = 200;                  // single-layer width/depth cap
const MAX_ENTITIES_PER_KIND = 1000;          // pickups / traps / doors / enemies / transitions
const MAX_TUTORIAL_STEPS = 64;              // tutorialSteps array cap (steps are 1-liner, not 3D objects)

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
  // P3-1d (M-2): reject oversized grids before allocating the walls
  // array. Without this, a malicious `width: 1000000` would crash the
  // tab (or freeze the test runner) on the next line.
  if (!Number.isInteger(width) || width < 1 || width > MAX_MAZE_SIZE) {
    throw new LevelLoadError(
      `Maze '${id}': width (${width}) must be an integer in [1, ${MAX_MAZE_SIZE}]`,
    );
  }
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_MAZE_SIZE) {
    throw new LevelLoadError(
      `Maze '${id}': depth (${depth}) must be an integer in [1, ${MAX_MAZE_SIZE}]`,
    );
  }
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

  // P3-1: default levelCount to 1 (single-layer back-compat for every
  // pre-P3-1 JSON). The validator is lenient: any integer in the 1..6
  // range is accepted; an out-of-range value falls back to 1 (the
  // current engine is single-layer only, so rejecting would be too
  // strict — a hand-crafted level with `levelCount: 99` would
  // suddenly fail to load when every other pre-P3-1 level works).
  // The strict per-layer cross-check (e.g. start.level < levelCount)
  // lands in P3-1b when the engine actually consumes the field.
  let levelCount: number;
  if (typeof m.levelCount === 'number' && Number.isInteger(m.levelCount) && m.levelCount >= 1 && m.levelCount <= 6) {
    levelCount = m.levelCount;
  } else {
    levelCount = 1;
  }

  // P5-1: per-layer wall grids. Required when levelCount > 1
  // (hand-crafted multi-layer JSON must carry one 2D grid per
  // layer, otherwise the engine's per-layer cache miss collapses
  // to [walls] and both layers render the same geometry). For
  // levelCount === 1 the field is optional — a hand-authored
  // single-layer level can keep the historical `walls` shape and
  // the engine falls back to [walls]. Each layer's grid must
  // match size.width × size.depth with 0/1 cells (same shape
  // contract as AlgorithmMazeProvider's per-layer output).
  let walls2d: CellType[][][] | undefined;
  if (Array.isArray(m.walls2d)) {
    if (m.walls2d.length !== levelCount) {
      throw new LevelLoadError(
        `Maze '${id}': walls2d layer count (${m.walls2d.length}) does not match levelCount (${levelCount})`,
      );
    }
    walls2d = [];
    for (let L = 0; L < levelCount; L++) {
      const layerWalls = m.walls2d[L];
      if (!Array.isArray(layerWalls) || layerWalls.length !== depth) {
        throw new LevelLoadError(
          `Maze '${id}': walls2d[${L}] row count does not match depth (${depth})`,
        );
      }
      const layer: CellType[][] = [];
      for (let z = 0; z < depth; z++) {
        const row = layerWalls[z];
        if (!Array.isArray(row) || row.length !== width) {
          throw new LevelLoadError(
            `Maze '${id}': walls2d[${L}][${z}] length does not match width (${width})`,
          );
        }
        const cells: CellType[] = [];
        for (let x = 0; x < width; x++) {
          const v = row[x];
          if (v !== 0 && v !== 1) {
            throw new LevelLoadError(
              `Maze '${id}': walls2d[${L}][${z}][${x}] must be 0 or 1 (got ${clampErrorValue(v)})`,
            );
          }
          cells.push(v as CellType);
        }
        layer.push(cells);
      }
      walls2d.push(layer);
    }
  } else if (levelCount > 1) {
    // Multi-layer level without walls2d — reject strictly so a
    // hand-crafted level with levelCount: 2 + walls: [...] doesn't
    // silently degrade to "both layers look the same". The lenient
    // single-layer path (walls without walls2d) still works.
    throw new LevelLoadError(
      `Maze '${id}': levelCount ${levelCount} requires walls2d field (array of ${levelCount} wall grids)`,
    );
  }

  // P3-1: default `transitions` to []. The validator accepts the
  // array as-is when present; non-array values fall back to []
  // (same lenient policy as `traps` / `doors` in P2-18). P3-1b
  // will read this array to render stair / hole / ladder meshes
  // and gate the player's `isOnTransition` flow.
  // P5-1: full structural validation for each transition entry —
  // `level` / `toLevel` must be in [0, levelCount), source and
  // dest cells must be in-bounds + not on the per-layer wall, and
  // ids must be unique. The per-layer wall lookup uses walls2d when
  // set (multi-layer) and falls back to `walls` for the single-
  // layer back-compat path. Without these checks a hand-crafted
  // level with levelCount: 2 + transitions: [{level: 0, toLevel: 5}]
  // would silently OOB in the engine's per-layer cache index.
  const transitions: import('./types').VerticalTransition[] = [];
  if (Array.isArray(m.transitions)) {
    const seenIds = new Set<string>();
    for (let i = 0; i < m.transitions.length; i++) {
      const raw = m.transitions[i];
      if (typeof raw !== 'object' || raw === null) {
        throw new LevelLoadError(`Maze '${id}': invalid transition at index ${i}`);
      }
      const t = raw as Record<string, unknown>;
      const tIdRaw = t.id;
      if (typeof tIdRaw !== 'string' || tIdRaw.length === 0) {
        throw new LevelLoadError(`Maze '${id}': transitions[${i}] missing string 'id'`);
      }
      const tId = tIdRaw;
      if (seenIds.has(tId)) {
        throw new LevelLoadError(
          `Maze '${id}': duplicate transition id '${clampErrorValue(tId)}'`,
        );
      }
      seenIds.add(tId);
      const tLevel = requireNumber(t, 'level', `${id}.transitions[${i}]`);
      if (!Number.isInteger(tLevel) || tLevel < 0 || tLevel >= levelCount) {
        throw new LevelLoadError(
          `Maze '${id}': transition '${clampErrorValue(tId)}' level (${tLevel}) out of bounds; expected 0..${levelCount - 1}`,
        );
      }
      const tX = requireNumber(t, 'x', `${id}.transitions[${i}]`);
      const tZ = requireNumber(t, 'z', `${id}.transitions[${i}]`);
      if (!Number.isInteger(tX) || tX < 0 || tX >= width) {
        throw new LevelLoadError(
          `Maze '${id}': transition '${clampErrorValue(tId)}' x (${tX}) out of bounds; expected 0..${width - 1}`,
        );
      }
      if (!Number.isInteger(tZ) || tZ < 0 || tZ >= depth) {
        throw new LevelLoadError(
          `Maze '${id}': transition '${clampErrorValue(tId)}' z (${tZ}) out of bounds; expected 0..${depth - 1}`,
        );
      }
      const tKind = t.kind;
      if (
        tKind !== 'stair-up' && tKind !== 'stair-down' &&
        tKind !== 'hole-down' && tKind !== 'hole-up' &&
        tKind !== 'ladder'
      ) {
        throw new LevelLoadError(
          `Maze '${id}': transition '${clampErrorValue(tId)}' has invalid kind '${clampErrorValue(tKind)}'`,
        );
      }
      const tToLevel = requireNumber(t, 'toLevel', `${id}.transitions[${i}]`);
      if (!Number.isInteger(tToLevel) || tToLevel < 0 || tToLevel >= levelCount) {
        throw new LevelLoadError(
          `Maze '${id}': transition '${clampErrorValue(tId)}' toLevel (${tToLevel}) out of bounds; expected 0..${levelCount - 1}`,
        );
      }
      // Destination cell: explicit toX/toZ OR default to source (x, z)
      // on the destination layer. Always validate in-bounds + not on
      // the destination layer's wall so a hand-authored stair-down on
      // a wall cell doesn't strand the player mid-air.
      const tToX = typeof t.toX === 'number' ? t.toX : tX;
      const tToZ = typeof t.toZ === 'number' ? t.toZ : tZ;
      if (!Number.isInteger(tToX) || tToX < 0 || tToX >= width) {
        throw new LevelLoadError(
          `Maze '${id}': transition '${clampErrorValue(tId)}' toX (${tToX}) out of bounds; expected 0..${width - 1}`,
        );
      }
      if (!Number.isInteger(tToZ) || tToZ < 0 || tToZ >= depth) {
        throw new LevelLoadError(
          `Maze '${id}': transition '${clampErrorValue(tId)}' toZ (${tToZ}) out of bounds; expected 0..${depth - 1}`,
        );
      }
      // Per-layer wall check. Use walls2d when set (multi-layer),
      // otherwise fall back to `walls` for the single-layer path.
      const sourceWalls = walls2d ? walls2d[tLevel] : walls;
      const destWalls = walls2d ? walls2d[tToLevel] : walls;
      if (sourceWalls[tZ][tX] === 1) {
        throw new LevelLoadError(
          `Maze '${id}': transition '${clampErrorValue(tId)}' source (L${tLevel}, x=${tX}, z=${tZ}) is on a wall`,
        );
      }
      if (destWalls[tToZ][tToX] === 1) {
        throw new LevelLoadError(
          `Maze '${id}': transition '${clampErrorValue(tId)}' dest (L${tToLevel}, x=${tToX}, z=${tToZ}) is on a wall`,
        );
      }
      transitions.push({
        id: tId,
        level: tLevel,
        x: tX,
        z: tZ,
        kind: tKind,
        toLevel: tToLevel,
        toX: tToX,
        toZ: tToZ,
      });
    }
  }

  // P3-1: helper — extract `level` from a raw position record
  // (start / exit) or a position-bearing entity (pickup / trap /
  // door / enemy). Missing / non-integer values fall back to 0
  // (the historical single-layer convention). The cast to
  // `Record<string, unknown>` mirrors the surrounding validator
  // style; downstream code reads `entity.level` as `number | undefined`
  // and the engine treats undefined as 0 in P3-1b.
  const startLevel = parseEntityLevel(start);
  const exitLevel = parseEntityLevel(exit);
  // P5-1: per-layer bounds check. start.level / exit.level must
  // satisfy 0 <= level < levelCount, otherwise the engine would
  // index past the per-layer cache (array OOB) and the player would
  // spawn on a non-existent layer. For levelCount === 1 the only
  // legal value is 0 (and the parser already defaults to 0 when the
  // field is missing), so the check passes silently.
  if (startLevel < 0 || startLevel >= levelCount) {
    throw new LevelLoadError(
      `Maze '${id}': start.level (${startLevel}) out of bounds; expected 0..${levelCount - 1}`,
    );
  }
  if (exitLevel < 0 || exitLevel >= levelCount) {
    throw new LevelLoadError(
      `Maze '${id}': exit.level (${exitLevel}) out of bounds; expected 0..${levelCount - 1}`,
    );
  }

  requireInBounds(start, 'x', 'z', `${id}.start`, width, depth);
  requireInBounds(exit, 'x', 'z', `${id}.exit`, width, depth);
  // P5-1: per-layer wall check. Use walls2d[level] when multi-layer
  // is set, fall back to `walls` for the single-layer back-compat
  // path. Without this, a 2-layer level with start on L1 would
  // check the wrong grid and let a wall-spawn through.
  const startLayerWalls = walls2d ? walls2d[startLevel] : walls;
  const exitLayerWalls = walls2d ? walls2d[exitLevel] : walls;
  if (startLayerWalls[start.z as number][start.x as number] === 1) {
    throw new LevelLoadError(`Maze '${id}': start is on a wall (L${startLevel})`);
  }
  if (exitLayerWalls[exit.z as number][exit.x as number] === 1) {
    throw new LevelLoadError(`Maze '${id}': exit is on a wall (L${exitLevel})`);
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
    // P2-18: parse optional keyColor for key pickups.
    // P3-1: parse optional `level` (defaults to 0; see parseEntityLevel
    // helper above for the lenient validation policy).
    let pickupKeyColor: Pickup['keyColor'];
    if (pp.type === 'key' && isKeyColor(pp.keyColor)) {
      pickupKeyColor = pp.keyColor;
    }
    const pickupLevel = parseEntityLevel(pp);
    normalizedPickups.push({
      id: pickupId,
      x: px,
      z: pz,
      type: pp.type,
      value: pvalue,
      keyColor: pickupKeyColor,
      level: pickupLevel,
    });
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

  // P3-1d (M-2): cap each entity array at MAX_ENTITIES_PER_KIND before
  // dispatching to the parser. parseEnemies / parseTraps / parseDoors
  // walk the array linearly, so an unbounded array would just slow
  // down the validator — but a million-entry enemies array balloons
  // the runtime enemy roster and the Scene's Mesh count. The check
  // here is the cheap "stop early" gate; the per-element validation
  // inside the parsers still runs.
  if (Array.isArray(m.enemies) && m.enemies.length > MAX_ENTITIES_PER_KIND) {
    throw new LevelLoadError(
      `Maze '${id}': enemies has ${m.enemies.length} entries; max ${MAX_ENTITIES_PER_KIND}`,
    );
  }
  if (Array.isArray(m.traps) && m.traps.length > MAX_ENTITIES_PER_KIND) {
    throw new LevelLoadError(
      `Maze '${id}': traps has ${m.traps.length} entries; max ${MAX_ENTITIES_PER_KIND}`,
    );
  }
  if (Array.isArray(m.doors) && m.doors.length > MAX_ENTITIES_PER_KIND) {
    throw new LevelLoadError(
      `Maze '${id}': doors has ${m.doors.length} entries; max ${MAX_ENTITIES_PER_KIND}`,
    );
  }
  if (Array.isArray(m.pickups) && m.pickups.length > MAX_ENTITIES_PER_KIND) {
    throw new LevelLoadError(
      `Maze '${id}': pickups has ${m.pickups.length} entries; max ${MAX_ENTITIES_PER_KIND}`,
    );
  }
  if (Array.isArray(m.transitions) && m.transitions.length > MAX_ENTITIES_PER_KIND) {
    throw new LevelLoadError(
      `Maze '${id}': transitions has ${m.transitions.length} entries; max ${MAX_ENTITIES_PER_KIND}`,
    );
  }

  // P2-18: traps and doors are optional fields. Missing or non-array → [].
  const traps = parseTraps(m.traps, id, width, depth, walls, start as { x: number; z: number }, exit as { x: number; z: number });
  const doors = parseDoors(m.doors, id, width, depth, walls, start as { x: number; z: number }, exit as { x: number; z: number });

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
    // P3-1d (M-2): cap tutorial steps. The cap is generous (64) —
    // teaching levels typically have 3-8 steps; 32 is the largest
    // historically-observed teaching level (final试炼). 64 leaves 2x
    // headroom while still preventing a malicious JSON from forcing
    // the banner to render hundreds of step chips.
    if (m.tutorialSteps.length > MAX_TUTORIAL_STEPS) {
      throw new LevelLoadError(
        `Maze '${id}': tutorialSteps has ${m.tutorialSteps.length} entries; max ${MAX_TUTORIAL_STEPS}`,
      );
    }
    // F-2026-07-01-FCR-H-3: validate each step's trigger shape so malformed
    // tutorial data is rejected at load time, not silently ignored at
    // runtime when the banner tries to render the bad trigger.
    const tsValidation = validateTutorialSteps(m.tutorialSteps);
    if (!tsValidation.ok) {
      throw new LevelLoadError(
        `Maze '${id}': invalid tutorialSteps: ${tsValidation.error}`,
      );
    }
    tutorialSteps = m.tutorialSteps as NonNullable<MazeData['tutorialSteps']>;
  }
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

  // F-2026-06-30: P2-16 — three new optional rules fields. Each is
  // silently dropped on invalid value (matches the lenient
  // `requireAllPickups` style: the validator never throws for a
  // bad-shape optional field, because the worst case is "uses the
  // default"). Each guard is the matching `is*` predicate from
  // maze/types.ts so the union stays single-source-of-truth.
  if (isMinimapMode(r.minimapMode)) {
    rules.minimapMode = r.minimapMode;
  }
  if (isMapOpenBehavior(r.mapOpenBehavior)) {
    rules.mapOpenBehavior = r.mapOpenBehavior;
  }
  if (isParchmentLifecycle(r.parchmentLifecycle)) {
    rules.parchmentLifecycle = r.parchmentLifecycle;
  }

  // F-2026-06-30: P2-16 — back-compat migration. The old
  // `MazeData.hideMinimap: boolean` field (P2-11) is replaced by
  // `rules.minimapMode: MinimapMode`. Hand-crafted JSON written before
  // P2-16 still has the boolean; instead of crashing we translate
  // `hideMinimap: true` to `rules.minimapMode: 'hidden'` (the only
  // behavior that boolean ever encoded) and warn once. Authors who
  // set `hideMinimap: false` or leave it absent end up with the
  // default minimap (top-right), which is the same behavior as before
  // the migration.
  if (m.hideMinimap === true) {
    if (!rules.minimapMode) {
      rules.minimapMode = 'hidden';
      // eslint-disable-next-line no-console -- F-2026-06-30: intentional one-time warning at load
      console.warn(
        `[maze3D] Maze '${id}': deprecated top-level 'hideMinimap: true' — ` +
          `migrated to rules.minimapMode: 'hidden'. Update the JSON for P2-16+.`,
      );
    }
    // Even when `rules.minimapMode` was already explicit, we still
    // need to suppress the legacy boolean from the final MazeData
    // literal below — `hideMinimap` is `@deprecated` and should not
    // round-trip into the runtime MazeData.
  }

  // F-2026-06-30: 'caught-by-enemy' is a P2-11 teaching-only victory
  // path. The editor hides the option for non-tutorial levels, but a
  // hand-edited JSON or an older export could still set it. Reject
  // here so the bad combo never reaches the runtime — a level that
  // wins on death is a misconfigured level, and the only legitimate
  // use is the 哨兵回廊 teaching-03 lesson.
  if (rules.victory === 'caught-by-enemy' && (!Array.isArray(tutorialSteps) || tutorialSteps.length === 0)) {
    throw new LevelLoadError(
      `Maze '${id}': victory 'caught-by-enemy' requires a non-empty tutorialSteps array`,
    );
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
  //
  // P3-1: start / exit / levelCount / transitions are added to the
  // final literal. `level` on start / exit is always set (defaults
  // to 0 via parseEntityLevel above) so downstream code can read
  // `data.start.level` unconditionally. `levelCount` defaults to 1
  // and `transitions` defaults to [] — both are validated above and
  // never undefined at this point.
  const maze: MazeData = {
    id: m.id as string,
    name: m.name as string,
    size: { width, depth },
    cellSize,
    start: { x: start.x as number, z: start.z as number, level: startLevel },
    exit: { x: exit.x as number, z: exit.z as number, level: exitLevel },
    walls,
    ...(walls2d !== undefined ? { walls2d } : {}),
    pickups: normalizedPickups,
    rules,
    enemies,
    traps,
    doors,
    levelCount,
    transitions,
    ...(i18n !== undefined ? { i18n } : {}),
    ...(tutorialSteps !== undefined ? { tutorialSteps } : {}),
    // F-2026-06-30: hideMinimap is no longer round-tripped into the
    // runtime MazeData; the migration block above already translated
    // any top-level `hideMinimap: true` into `rules.minimapMode: 'hidden'`.
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
      // P3-1: see parseEntityLevel above. Defaults to 0; engine
      // pins each enemy to a single layer in P3-1b.
      level: parseEntityLevel(ee),
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

// P3-1: shared level-default helper. Promoted to module scope so
// the position-bearing parser helpers below (parseEnemies /
// parseTraps / parseDoors) and the inline pickup loop in
// validateMaze can all reuse the same lenient `level` extraction.
// Returns 0 (single-layer back-compat) for any input that is not a
// non-negative integer. P3-1b will widen the policy to also bound
// the value by `levelCount - 1`; P3-1a only owns the shape.
function parseEntityLevel(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return 0;
  const lvl = (raw as Record<string, unknown>).level;
  return typeof lvl === 'number' && Number.isInteger(lvl) && lvl >= 0 ? lvl : 0;
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

// P2-18: parse traps from raw JSON. Returns [] when the field is missing
// or not an array. Follows the parseEnemies pattern: in-bounds, on-walkable,
// non-start/exit, dedupe by cell, auto-mint id.
function parseTraps(
  raw: unknown,
  id: string,
  width: number,
  depth: number,
  walls: CellType[][],
  start: { x: number; z: number },
  exit: { x: number; z: number },
): Trap[] {
  if (!Array.isArray(raw)) return [];
  const out: Trap[] = [];
  const seenCells = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (typeof t !== 'object' || t === null) {
      throw new LevelLoadError(`Maze '${id}': invalid trap at index ${i}`);
    }
    const tt = t as Record<string, unknown>;
    const tx = requireNumber(tt, 'x', `${id}.traps[${i}]`);
    const tz = requireNumber(tt, 'z', `${id}.traps[${i}]`);
    requireInBounds(tt, 'x', 'z', `${id}.traps[${i}]`, width, depth);
    if (walls[tz][tx] === 1) {
      throw new LevelLoadError(`Maze '${id}': trap at (${tx}, ${tz}) is on a wall`);
    }
    if (tx === start.x && tz === start.z) {
      throw new LevelLoadError(`Maze '${id}': trap is on the start cell`);
    }
    if (tx === exit.x && tz === exit.z) {
      throw new LevelLoadError(`Maze '${id}': trap is on the exit cell`);
    }
    if (!isTrapKind(tt.kind)) {
      throw new LevelLoadError(`Maze '${id}': invalid trap kind at index ${i}`);
    }
    const cellKey = `${tx},${tz}`;
    if (seenCells.has(cellKey)) {
      throw new LevelLoadError(`Maze '${id}': duplicate trap at (${tx}, ${tz})`);
    }
    seenCells.add(cellKey);
    const trapId = typeof tt.id === 'string' && tt.id.length > 0 ? tt.id : generateId();
    const trap: Trap = { id: trapId, x: tx, z: tz, kind: tt.kind };
    if (typeof tt.damage === 'number' && Number.isFinite(tt.damage) && tt.damage > 0) {
      trap.damage = tt.damage;
    }
    if (typeof tt.slowDurationSec === 'number' && Number.isFinite(tt.slowDurationSec) && tt.slowDurationSec > 0) {
      trap.slowDurationSec = tt.slowDurationSec;
    }
    // P3-1: see parseEntityLevel above. Defaults to 0.
    trap.level = parseEntityLevel(tt);
    out.push(trap);
  }
  return out;
}

// P2-18: parse doors from raw JSON. Returns [] when the field is missing
// or not an array. Each door must be on a walkable, non-start/exit cell
// with a valid keyColor.
function parseDoors(
  raw: unknown,
  id: string,
  width: number,
  depth: number,
  walls: CellType[][],
  start: { x: number; z: number },
  exit: { x: number; z: number },
): Door[] {
  if (!Array.isArray(raw)) return [];
  const out: Door[] = [];
  const seenCells = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i];
    if (typeof d !== 'object' || d === null) {
      throw new LevelLoadError(`Maze '${id}': invalid door at index ${i}`);
    }
    const dd = d as Record<string, unknown>;
    const dx = requireNumber(dd, 'x', `${id}.doors[${i}]`);
    const dz = requireNumber(dd, 'z', `${id}.doors[${i}]`);
    requireInBounds(dd, 'x', 'z', `${id}.doors[${i}]`, width, depth);
    if (walls[dz][dx] === 1) {
      throw new LevelLoadError(`Maze '${id}': door at (${dx}, ${dz}) is on a wall`);
    }
    if (dx === start.x && dz === start.z) {
      throw new LevelLoadError(`Maze '${id}': door is on the start cell`);
    }
    if (dx === exit.x && dz === exit.z) {
      throw new LevelLoadError(`Maze '${id}': door is on the exit cell`);
    }
    if (!isKeyColor(dd.keyColor)) {
      throw new LevelLoadError(`Maze '${id}': invalid door keyColor at index ${i}`);
    }
    const cellKey = `${dx},${dz}`;
    if (seenCells.has(cellKey)) {
      throw new LevelLoadError(`Maze '${id}': duplicate door at (${dx}, ${dz})`);
    }
    seenCells.add(cellKey);
    const doorId = typeof dd.id === 'string' && dd.id.length > 0 ? dd.id : generateId();
    // P3-1: see parseEntityLevel above. Defaults to 0.
    out.push({ id: doorId, x: dx, z: dz, keyColor: dd.keyColor, level: parseEntityLevel(dd) });
  }
  return out;
}
