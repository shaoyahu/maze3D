export type CellType = 0 | 1;
export type PickupType = 'time' | 'health' | 'key';
// F-2026-06-17-A-CRITICAL-2: 'caught-by-enemy' is the 哨兵回廊 teaching-03
// victory path — the level is won by being caught (tutorial completion
// pattern). Adding the literal here keeps the union in lockstep with
// VICTORY_TYPE_VALUES; P2-11 commit 419d89e added the value to the
// whitelist but missed the union, so typecheck has been red for 30 errors
// since 2026-06-16. Keep this and VICTORY_TYPE_VALUES sorted identically
// to make the contract obvious.
export type VictoryType = 'reach-exit' | 'survive' | 'time-trial' | 'caught-by-enemy';

// F-D-quality-D-16: the level-select source picker has its own literal
// union. It used to live inline in LevelSelect.tsx, but lifting it here
// gives it a single home alongside the runtime whitelist that drives
// `isLevelSource`.
export type LevelSource = 'teaching' | 'random' | 'custom' | 'seed';

// F-D-quality-HIGH-2 + D-16: runtime whitelists backing the type guards.
// The literal-typed arrays double as both compile-time documentation of
// the union and the runtime values the guards check against. The shape
// (readonly tuple of literals) lets `isFoo` narrow the input type without
// an `as never` cast on the includes() call.
export const PICKUP_TYPE_VALUES: readonly PickupType[] = ['time', 'health', 'key'];
export const VICTORY_TYPE_VALUES: readonly VictoryType[] = [
  'reach-exit',
  'survive',
  'time-trial',
  'caught-by-enemy',
];
export const LEVEL_SOURCE_VALUES: readonly LevelSource[] = [
  'teaching',
  'random',
  'custom',
  'seed',
];
export const MAZE_SIZE_VALUES: readonly MazeSize[] = [15, 30, 50];

// F-D-quality-HIGH-2 + D-16: UI-boundary type guards. The old code reached
// for `as PickupType` / `as VictoryType` / `as MazeSize` / `as LevelSource`
// / `as 30 | 60 | 90 | 120` after reading a raw `<select>` value, trusting
// the only writer was the same component. Each guard rejects:
//   - non-string (or non-number, for numeric unions) inputs up-front, so
//     `null` / `undefined` / objects can't reach the includes() call
//   - NaN — `includes()` uses SameValueZero, so NaN never matches a
//     literal, but the explicit `Number.isFinite` keeps the intent
//     obvious to a reader
//   - values outside the literal union via the readonly whitelist
export function isPickupType(v: unknown): v is PickupType {
  return typeof v === 'string' && (PICKUP_TYPE_VALUES as readonly string[]).includes(v);
}

export function isVictoryType(v: unknown): v is VictoryType {
  return typeof v === 'string' && (VICTORY_TYPE_VALUES as readonly string[]).includes(v);
}

export function isLevelSource(v: unknown): v is LevelSource {
  return typeof v === 'string' && (LEVEL_SOURCE_VALUES as readonly string[]).includes(v);
}

export function isMazeSize(v: unknown): v is MazeSize {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    (MAZE_SIZE_VALUES as readonly number[]).includes(v)
  );
}

export function isSurviveSeconds(v: unknown): v is SurviveSeconds {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    (SURVIVE_SECONDS_VALUES as readonly number[]).includes(v)
  );
}

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
  // P2-4b: stable per-pickup identifier. The editor assigns new ids via
  // crypto.randomUUID() at construction time; JsonMazeProvider auto-fills
  // a UUID for hand-crafted JSON levels saved before this field existed.
  id: string;
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
  // P2-11: optional per-level enemy aggression override. When set, the
  // engine uses this value instead of `settingsStore.enemyAggression`.
  // Used by 哨兵回廊 to lock the chase speed to 'medium' (1.5x) regardless
  // of the user's global settings choice.
  enemyAggression?: EnemyAggression;
  // P2-11: when true, the player must collect every pickup before
  // `crossesExit` reports success. Used by 最终试炼.
  requireAllPickups?: boolean;
}

export interface MazeData {
  id: string;
  name: string;
  // P2-8: optional per-locale display names. `name` is the canonical
  // (Chinese) name and is used in URLs / seeds; UI consumers should
  // resolve the user-facing name via `getDisplayName(maze, locale)`
  // which falls back to `name` when an entry is missing or empty.
  i18n?: { en?: string };
  size: { width: number; depth: number };
  cellSize: number;
  start: { x: number; z: number };
  exit: { x: number; z: number };
  walls: CellType[][];
  pickups: Pickup[];
  rules: LevelRules;
  enemies: EnemySpawn[];
  // P2-11: when true, the runtime skips rendering the Minimap. Used by
  // 哨兵回廊 to hide the map during the chase.
  hideMinimap?: boolean;
  // P2-11: ordered list of tutorial steps. When present, the
  // TutorialBanner component renders a step-by-step walkthrough driven
  // by events from the engine (mouse-look / key-pressed / pickup /
  // exit / timeout). See `TutorialStep` + `TutorialTrigger`.
  tutorialSteps?: TutorialStep[];
}

// ---------------------------------------------------------------------------
// P2-11: tutorial step system
// ---------------------------------------------------------------------------

// One step in a teaching level's guided walkthrough. `messageKey` is an
// i18n key (`tutorial.teaching01.step1`-style). The `trigger` defines
// which engine event causes advancement to the next step; `timeoutSec`
// is an optional fallback that fires `advance()` after N seconds so the
// tutorial never deadlocks if the player never performs the trigger.
//
// All tutorial steps are optional in MazeData — production / custom
// levels just omit the field and no banner is rendered.
export interface TutorialStep {
  id: string;
  messageKey: string;
  trigger: TutorialTrigger;
}

export type TutorialTrigger =
  // Cumulative mouse yaw+pitch since the step started. Engine accumulates
  // per-frame deltas and emits a single `mouse-look` event when the
  // threshold (~0.3 rad) is crossed; no further events fire for this
  // step after that.
  | { type: 'mouse-look'; timeoutSec?: number }
  // Any key from `keys` pressed. Single event per step.
  | { type: 'key-pressed'; keys: string[]; timeoutSec?: number }
  // The Nth pickup was collected (default N=1, i.e. first pickup).
  | { type: 'pickup-collected'; count?: number; timeoutSec?: number }
  // Player walked through the exit cell.
  | { type: 'reached-exit'; timeoutSec?: number }
  // Pure timer; `timeoutSec` is required.
  | { type: 'timeout'; timeoutSec: number };

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

// P2-6: free-input range for 存活秒数. The previous SURVIVE_SECONDS_VALUES
// (30/60/90/120) is preserved as the chip presets; the new MIN/MAX bound
// the user-typed value used by the level-select survive-seconds input.
export const SURVIVE_SECONDS_MIN = 10;
export const SURVIVE_SECONDS_MAX = 600;

export const SURVIVE_SECONDS_VALUES = [30, 60, 90, 120] as const;
export type SurviveSeconds = (typeof SURVIVE_SECONDS_VALUES)[number];
export const SURVIVE_SECONDS_DEFAULT: SurviveSeconds = 90;

export const SPAWN_SCHEDULE_DEFAULT: SpawnSchedule = {
  intervalSec: 15,
  onPickup: true,
  enabled: true,
};

// P2-6: progressive-spawn 上限输入框约束. The runtime SPAWN_SCHEDULE_DEFAULT
// already hard-codes `enabled: true` but does not bound the progressive
// upper cap (engine-side it's clamped per-tick). The UI exposes a max
// input that mirrors ENEMY_COUNT_MIN/MAX/DEFAULT naming.
export const SPAWN_PROGRESSIVE_MAX_DEFAULT = 10;

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

export const ENEMY_CHASE_MULTIPLIER_EASY = 1.2;
export const ENEMY_CHASE_MULTIPLIER_MEDIUM = 1.5;
export const ENEMY_CHASE_MULTIPLIER_HARD = 1.8;

export function enemyChaseMultiplier(aggression: EnemyAggression): number {
  switch (aggression) {
    case 'easy':
      return ENEMY_CHASE_MULTIPLIER_EASY;
    case 'hard':
      return ENEMY_CHASE_MULTIPLIER_HARD;
    case 'medium':
    default:
      return ENEMY_CHASE_MULTIPLIER_MEDIUM;
  }
}

// ---------------------------------------------------------------------------
// P2-4b: level editor
// ---------------------------------------------------------------------------

// Active tool in the editor viewport. The runtime game does not import this
// union; it lives here because the editor types module re-uses the maze
// types barrel.
export type EditorTool =
  | 'select'
  | 'wall'
  // F-P2-9: dedicated erase / carve tool. `wall` is set-to-1 (place a
  // wall); `erase` is set-to-0 (carve a floor / passage). Splitting
  // these is what makes the tools predictable: previously `placeWall`
  // was a toggle, which contradicted the label and led designers to
  // draw walls by clicking and then "undo" their work.
  | 'erase'
  | 'start'
  | 'exit'
  | 'pickup'
  | 'enemy'
  | 'pan';

// reject anything whose schemaVersion is not exactly this value.
export const SCHEMA_VERSION = 1 as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

