export type CellType = 0 | 1;
export type PickupType = 'time' | 'health' | 'key';
export type VictoryType = 'reach-exit' | 'survive' | 'time-trial';

// P2-2 F6+F7: single source of truth for inventory slot count and per-slot
// type. Previously INVENTORY_SIZE lived in gameStore.ts and the `0 | 1`
// union was hand-rolled in 6 signatures (Rules.ts, InputManager.ts x2,
// Game.ts, gameStore.ts x2); when the inventory grew, the constant updated
// but the type union kept lying. The slot union is still hand-rolled to
// match the constant — TypeScript can't derive `0..N-1` from a const
// without a tuple/length trick. Bump both in the same edit.
export const INVENTORY_SIZE = 2;
export type InventorySlot = 0 | 1;

export interface Pickup {
  x: number;
  z: number;
  type: PickupType;
  value: number;
}

export interface LevelRules {
  initialTime: number;
  maxHealth: number;
  victory: VictoryType;
  timeOnPickup: number;
}

export interface MazeData {
  id: string;
  name: string;
  size: { width: number; depth: number };
  cellSize: number;
  start: { x: number; z: number };
  exit: { x: number; z: number };
  walls: CellType[][];
  pickups: Pickup[];
  rules: LevelRules;
  enemies: EnemySpawn[];
}

export interface MazeProvider {
  load(id: string): Promise<MazeData>;
  list(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// P2-3: procedural modes
// ---------------------------------------------------------------------------

// The 4 maze-generation algorithms shipped in P2-3. The string is also part
// of the encoded seed id (algo-v1-{algorithm}-{size}-{hex}), so renaming a
// variant is a breaking change to existing localStorage best records.
export type Algorithm = 'recursive-backtracker' | 'kruskal' | 'prim' | 'hunt-and-kill';

// Square grid sizes the procedural provider accepts. The literal union
// doubles as the whitelist enforced by decodeSeed() in utils/seed.ts; adding
// a new size requires updating both this type and the VALID_SIZES list
// inside encodeSeed/decodeSeed.
export type MazeSize = 15 | 30 | 50;

// The full self-describing seed. A 64-bit mazeSeed lets the algorithm
// produce ~1.8e19 distinct mazes per (algorithm, size) pair, which is more
// than enough to make seed collisions irrelevant in practice.
export interface Seed {
  algorithm: Algorithm;
  size: MazeSize;
  mazeSeed: string; // 16 lowercase hex chars (see utils/seed.ts)
}

// Options passed through App -> startLevel. The provider fills in the rest
// of the MazeData; the store stores this for level-restart, best-record
// tagging, and future E2E share-link features.
export interface StartLevelOptions {
  seed?: Seed;
  mode?: VictoryType;
  enemyCount?: number;
  spawnSchedule?: SpawnSchedule;
  surviveSeconds?: 30 | 60 | 90 | 120;
}

// ---------------------------------------------------------------------------
// P2-4a: enemies + survive mode
// ---------------------------------------------------------------------------

export type EnemyState = 'patrol' | 'dwell' | 'chase';

export interface EnemySpawn {
  id: string;
  x: number;
  z: number;
  path: Array<{ x: number; z: number }>;
  dwellTime?: number;
  fovRange?: number;
  fovAngleDeg?: number;
}

export interface SpawnSchedule {
  intervalSec: number;
  onPickup: boolean;
  enabled: boolean;
}

export type EnemyAggression = 'easy' | 'medium' | 'hard';

export const ENEMY_COUNT_MIN = 0;
export const ENEMY_COUNT_MAX = 10;
export const ENEMY_COUNT_DEFAULT = 3;

export const SURVIVE_SECONDS_VALUES = [30, 60, 90, 120] as const;
export type SurviveSeconds = (typeof SURVIVE_SECONDS_VALUES)[number];
export const SURVIVE_SECONDS_DEFAULT: SurviveSeconds = 90;

export const SPAWN_SCHEDULE_DEFAULT: SpawnSchedule = {
  intervalSec: 15,
  onPickup: true,
  enabled: true,
};

export function clampEnemyCount(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return ENEMY_COUNT_DEFAULT;
  if (value < ENEMY_COUNT_MIN) return ENEMY_COUNT_MIN;
  if (value > ENEMY_COUNT_MAX) return ENEMY_COUNT_MAX;
  return value;
}

export function isValidSurviveSeconds(value: number | undefined): value is SurviveSeconds {
  return value !== undefined && (SURVIVE_SECONDS_VALUES as readonly number[]).includes(value);
}

export function normalizeSurviveSeconds(
  value: number | undefined,
): SurviveSeconds {
  return isValidSurviveSeconds(value) ? value : SURVIVE_SECONDS_DEFAULT;
}

export function isValidEnemyPath(enemy: Pick<EnemySpawn, 'path'>): boolean {
  return enemy.path.length >= 2;
}
