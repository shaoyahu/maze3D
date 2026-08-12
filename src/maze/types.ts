export type CellType = 0 | 1;
export type PickupType = 'time' | 'health' | 'key';
// P2-18: trap kinds — fire (damage + burn mark) and water (slow + water mark).
export type TrapKind = 'fire' | 'water';
// P2-18: key colors for color-keyed doors. 4 colors per user decision.
export type KeyColor = 'red' | 'blue' | 'green' | 'yellow';
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
// P2-18: runtime whitelists for trap kinds and key colors.
export const TRAP_KIND_VALUES: readonly TrapKind[] = ['fire', 'water'];
export const KEY_COLOR_VALUES: readonly KeyColor[] = ['red', 'blue', 'green', 'yellow'];
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

// P2-18: type guards for TrapKind and KeyColor, mirroring the existing
// isPickupType / isVictoryType pattern.
export function isTrapKind(v: unknown): v is TrapKind {
  return typeof v === 'string' && (TRAP_KIND_VALUES as readonly string[]).includes(v);
}

export function isKeyColor(v: unknown): v is KeyColor {
  return typeof v === 'string' && (KEY_COLOR_VALUES as readonly string[]).includes(v);
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
  // P2-18: optional key color. When type === 'key', this determines which
  // color-keyed door the key can unlock. Omitting keyColor leaves the key
  // as a generic/unlockable placeholder (backward-compat for existing levels).
  keyColor?: KeyColor;
  // P3-1: which vertical layer this pickup lives on. Defaults to 0
  // (the only layer in pre-P3-1 levels); JsonMazeProvider auto-fills
  // 0 when the JSON omits the field. The runtime engine reads this
  // field but the cell convention (floor(x/cs)) and the in-bounds
  // validator are unchanged — `level` is metadata, not a coordinate.
  level?: number;
}

// P2-18: a cell-level trap that triggers when the player walks onto it.
export interface Trap {
  id: string;
  x: number;
  z: number;
  kind: TrapKind;
  // fire: damage per hit (defaults to 1 when omitted)
  damage?: number;
  // water: slow duration in seconds (defaults to 1.5 when omitted)
  slowDurationSec?: number;
  // P3-1: see Pickup.level above. Defaults to 0.
  level?: number;
}

// P2-18: a color-keyed door. Initially locked (treated as a wall by
// collision); opened by using a matching-keyColor pickup from inventory.
// Door state resets on every startLevel (engine-side Set<string>).
export interface Door {
  id: string;
  x: number;
  z: number;
  keyColor: KeyColor;
  // P3-1: see Pickup.level above. Defaults to 0.
  level?: number;
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
  // P2-16: which minimap style this level uses. Defaults to 'top-right'
  // (the original auto-rendering minimap) when omitted. Set to
  // 'parchment' to opt into the M-key hand-held map; the two
  // `*Behavior` / `*Lifecycle` fields below only take effect then.
  minimapMode?: MinimapMode;
  // P2-16: when the parchment map is open, does the world keep ticking?
  // Defaults to 'pause' when omitted. Ignored unless
  // `minimapMode === 'parchment'`.
  mapOpenBehavior?: MapOpenBehavior;
  // P2-16: should the parchment's `visitedCells` + `damageRegions`
  // survive a death / restart? Defaults to 'reset-on-death' when
  // omitted. The death hook is API-level for now (the engine has no
  // death flow yet); the behavior is fully active once a death-
  // increment lands.
  parchmentLifecycle?: ParchmentLifecycle;
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
  start: { x: number; z: number; level?: number };
  exit: { x: number; z: number; level?: number };
  walls: CellType[][];
  pickups: Pickup[];
  rules: LevelRules;
  enemies: EnemySpawn[];
  // P2-18: traps and doors on this level.
  traps: Trap[];
  doors: Door[];
  // P2-11: when true, the runtime skips rendering the Minimap. Used by
  // 哨兵回廊 to hide the map during the chase.
  //
  // @deprecated since P2-16; kept for back-compat. `JsonMazeProvider`
  // auto-migrates a top-level `hideMinimap: true` to
  // `rules.minimapMode: 'hidden'` and warns once. New levels should
  // set `rules.minimapMode` instead.
  hideMinimap?: boolean;
  // P2-11: ordered list of tutorial steps. When present, the
  // TutorialBanner component renders a step-by-step walkthrough driven
  // by events from the engine (mouse-look / key-pressed / pickup /
  // exit / timeout). See `TutorialStep` + `TutorialTrigger`.
  tutorialSteps?: TutorialStep[];
  // P2-13: parent folder id. When present, the level is grouped under
  // the folder in the editor's left-panel file tree; when undefined
  // (or pointing at a deleted folder), the level renders under the
  // default "我的" folder. Editor-only metadata; the runtime engine
  // does not look at this field.
  folderId?: string;
  // P3-1: how many vertical layers this level has. Valid range is
  // 1..6 (per spec §4.1). Defaults to 1 when omitted from JSON —
  // every pre-P3-1 level is implicitly a 1-layer maze and the
  // validator fills `1` so downstream code can read this field
  // unconditionally. The engine-side multi-layer rendering is
  // scheduled for P3-1b; P3-1a only owns the data layer + seed
  // codec + backward compat.
  levelCount?: number;
  // P3-1: vertical transitions (stair / hole / ladder) that connect
  // two layers. Defaults to `[]` when omitted. Each entry's `level`
  // is the source layer; `toLevel` is the destination layer
  // (default ±1 per `kind`). Like the entity fields, the runtime
  // engine in P3-1b will read this array; P3-1a only owns the
  // validator (forward-compatible shape, lenient on missing fields).
  transitions?: VerticalTransition[];
}

// P3-1: per-layer data shape. The runtime engine in P3-1b will
// materialize one `LevelData` per layer; P3-1a only declares the
// type so future generators / validators have a typed home for
// "one layer's worth of walls + identity". `MazeData.walls` still
// carries the single 2D grid for backward compat (P3-1a is data
// layer only — engine refactor lands in P3-1b).
export interface LevelData {
  // 0-indexed layer id. Layer 0 is the bottom (Q10 convention).
  level: number;
  // The 2D wall grid for this layer, in (z, x) order — same shape
  // as the legacy single-layer `MazeData.walls`. Engine will pick
  // the right `LevelData` based on the player's current layer in
  // P3-1b.
  walls: CellType[][];
}

// P3-1: a single inter-layer connection. `level` is the source
// layer; `toLevel` is the destination. The kind dictates both
// the visual mesh and the player input contract (stair-up is
// walked; hole-down requires a brief warning flash + drop; ladder
// is a stationary W/S interaction — see spec.md §3 decision 1).
//
// P3-1a is data layer only: the validator accepts the shape
// leniently, but the engine does not yet render or activate any
// of these transitions. P3-1b is when the runtime starts reading
// `transitions` to drive collision, player movement, and visuals.
export interface VerticalTransition {
  id: string;
  // Source layer (0 = bottom). P3-1b will render the transition's
  // mesh on this layer and the player's collision check fires
  // when they walk into `(x, z)` on this layer.
  level: number;
  x: number;
  z: number;
  // Which inter-layer mechanic this is. 'stair-up' / 'stair-down'
  // are walked transitions (engine interpolates player.y over
  // ~0.5s); 'hole-down' / 'hole-up' are fall / jump transitions
  // (engine plays a 0.4s drop animation and pins player input);
  // 'ladder' is a stationary W/S climb. The literal union
  // matches the spec §3 decision 1 design.
  kind: 'stair-up' | 'stair-down' | 'hole-down' | 'hole-up' | 'ladder';
  // Destination layer. Defaults to `level + 1` for `*-up` kinds
  // and `level - 1` for `*-down` kinds; the engine will apply
  // that default when the field is omitted (P3-1b implementation
  // detail). P3-1a accepts an explicit value and the literal
  // range check (must satisfy `0 <= toLevel < levelCount`) is
  // applied in the validator.
  toLevel: number;
  // Optional landing offset. Defaults to the same (x, z) on the
  // destination layer. A hand-authored stair may want a small
  // lateral step so the player doesn't re-trigger the stair on
  // landing; the editor UI in P3-1c will surface these fields.
  toX?: number;
  toZ?: number;
}

// P3-1c: the literal union on `VerticalTransition.kind`, lifted to
// a named type so editor actions (placeTransition) and the
// properties-panel form (TransitionForm) can both reference the
// same source-of-truth. P3-1a only declared the inline union
// because no other site needed the alias; the editor places
// transitions by tool name (e.g. 'stair-up'), and the tool
// literal must match the data literal — this alias guarantees it.
export type TransitionKind = VerticalTransition['kind'];

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

// P2-19: extended from 4 to 8 algorithms. P2-20: 12. P2-21: 15 (full
// jamisbuck.org/mazes set). The string is also part of the encoded seed
// id (algo-v1-{algorithm}-{size}-{hex}), so renaming a variant is a
// breaking change to existing localStorage best records.
// P2-19 additions: 'eller' / 'sidewinder' / 'binary-tree' / 'growing-tree'.
// P2-20 additions: 'parallel-backtracker' / 'recursive-division' /
// 'aldous-broder' / 'wilsons'.
// P2-21 additions: 'houston' / 'growing-binary-tree' /
// 'blobby-recursive-division'.
//
// P2-21 cleanup (DESIGN DEBT #7): the literal union below is the
// single source of truth for algorithm id literals. The runtime
// enumeration (ALGORITHM_IDS) and the labelKey map live in
// `maze/algorithmRegistry.ts` and `i18n/resources/{en,zh}.ts`
// respectively; both are kept in lockstep with this union by the
// `Record<Algorithm, number>` and `Record<Algorithm, AlgorithmEntry>`
// types in the registry, so widening this union without also
// adding an entry to ALGORITHM_REGISTRY is a typecheck error. See
// `algorithmRegistry.ts` for the full design.
export type Algorithm =
  | 'recursive-backtracker'
  | 'kruskal'
  | 'prim'
  | 'hunt-and-kill'
  | 'eller'
  | 'sidewinder'
  | 'binary-tree'
  | 'growing-tree'
  | 'parallel-backtracker'
  | 'recursive-division'
  | 'aldous-broder'
  | 'wilsons'
  | 'houston'
  | 'growing-binary-tree'
  | 'blobby-recursive-division';

// Square grid sizes the procedural provider accepts. The literal union
// doubles as the whitelist enforced by decodeSeed() in utils/seed.ts; adding
// a new size requires updating both this type and the VALID_SIZES list
// inside encodeSeed/decodeSeed.
export type MazeSize = 15 | 30 | 50;

// P3-1: number of vertical layers a procedurally generated level can
// request. The 1..6 range mirrors spec.md §12 Q6 / Q7 (decision table):
// Q6 picked the v2 seed format which carries this count, and Q7
// capped the user-selectable level count at 6 (1 is the back-compat
// default and is equivalent to "no multi-level rendering"). The
// `LEVEL_COUNT_VALUES` tuple is the runtime whitelist that backs
// `isLevelCount` — mirroring the `MAZE_SIZE_VALUES / isMazeSize`
// pattern so the JSON / URL validator can share a single source of
// truth with the seed codec.
export type LevelCount = 1 | 2 | 3 | 4 | 5 | 6;
export const LEVEL_COUNT_VALUES: readonly LevelCount[] = [1, 2, 3, 4, 5, 6];

// P3-1: i18n placeholder keys for the multi-level UI surfaces
// (HUD level indicator + parchment level tab). P3-1a lands the
// strings in src/i18n/resources/{en,zh}.ts but does NOT render
// them — the consuming components land in P3-1c (HUD) and
// P3-1c (parchment). This array is the single source of truth
// that documents the placeholder set; it is also what keeps
// `tests/unit/i18n/keysParity.test.ts` happy (the orphan-key
// detector scans src/** for any quoted string literal that
// matches the i18n dotted-key shape, so a literal reference
// here satisfies the "key must be consumed" rule). P3-1c will
// move the references into the actual UI components and the
// array becomes a removal candidate.
export const P3_1_LEVEL_I18N_KEYS = [
  'hud.levelIndicator.label',
  'hud.levelIndicator.short',
  'overlays.parchment.levelTab',
] as const;

export function isLevelCount(v: unknown): v is LevelCount {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    (LEVEL_COUNT_VALUES as readonly number[]).includes(v)
  );
}

// The full self-describing seed. A 64-bit mazeSeed lets the algorithm
// produce ~1.8e19 distinct mazes per (algorithm, size) pair, which is more
// than enough to make seed collisions irrelevant in practice.
//
// P3-1: `levelCount` is optional so a v1 seed (which never carried this
// field) round-trips through `Seed` unchanged. The seed codec in
// `utils/seed.ts` decodes a v1 id to `levelCount = undefined`; callers
// (AlgorithmMazeProvider, levelStore.isValidSeed, ...) must treat
// `undefined` as "single layer" and fall back to `1`. The v2 codec
// (`encodeSeedV2` / `decodeSeed` v2 branch) populates this field.
export interface Seed {
  algorithm: Algorithm;
  size: MazeSize;
  mazeSeed: string; // 16 lowercase hex chars (see utils/seed.ts)
  levelCount?: LevelCount;
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

// P4 refactor-fp2d: rendering mode for /game. The 2D top-down
// path is the historical default and is byte-identical to every
// URL minted before this branch landed (the `view` query is
// omitted in that case, so an old link keeps working). The
// `fp3d` mode is a first-person perspective camera that consumes
// the SAME 2D multi-layer data (P3-1 walls + levelCount +
// transitions) — there is no separate "3D data"; the only
// delta from `2d` is the camera + the mesh styling. This is
// the locked contract: 3D mode ≠ 6-direction free movement,
// 3D mode = first-person view of 2D multi-layer. See
// docs/increments/p4-refactor-fp2d/spec.md §1.
export type ViewMode = '2d' | 'fp3d';

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
  // P3-1: see Pickup.level above. Defaults to 0. Each enemy is
  // pinned to a single layer; per-layer AI scopes the patrol
  // path to the same layer and the runtime only collides when the
  // player is on the matching layer.
  level?: number;
}

export interface SpawnSchedule {
  intervalSec: number;
  onPickup: boolean;
  enabled: boolean;
  // P3-1 fix-progressive-max: cap on the *concurrent* enemy count
  // on the field. The LevelSelect "渐进上限" input is the
  // canonical user entry point — it lives on `StartLevelOptions`
  // as `progressiveMax` and is round-tripped through the URL
  // (`?progressive=1&progressiveMax=5`). Required field (not
  // optional) so the type system surfaces every consumer that
  // needs to forward it; DEFAULT gives the value at every
  // construction site.
  max: number;
}

export type EnemyAggression = 'easy' | 'medium' | 'hard';

// P2-16: replaces the old `MazeData.hideMinimap: boolean` toggle. Three
// modes: the original auto-rendering top-right Minimap, the new
// "hand-held parchment" (M-key fullscreen modal, blank until walked),
// or completely hidden. A single field is used instead of two booleans
// so the schema can't reach a mutually-inconsistent state.
export type MinimapMode = 'top-right' | 'parchment' | 'hidden';

// P2-16: only relevant when `minimapMode === 'parchment'`. Decides
// whether the world keeps ticking while the player is reading the
// parchment ('continue' = higher tension, player can take damage).
// Engine-side validation enforces that this value is ignored unless
// the parchment mode is active.
export type MapOpenBehavior = 'pause' | 'continue';

// P2-16: only relevant when `minimapMode === 'parchment'`. Decides
// whether `visitedCells` + `damageRegions` survive a death / restart.
// The current engine has no death flow, so this is wired up as an
// API-level flag (parchment.reset() / parchment.persist()) and the
// behavior will be fully active in a follow-up death-increment.
export type ParchmentLifecycle = 'reset-on-death' | 'persist';

// F-2026-06-17-D-L-3: runtime whitelist backing the type guard, mirroring
// the PICKUP_TYPE_VALUES / VICTORY_TYPE_VALUES pattern. P2-11 added the
// `enemyAggression` literal union but didn't ship a guard, so the
// validator in JsonMazeProvider.ts:260-261 fell back to a hand-rolled
// 3-branch `if`. This guard lets the validator and any future consumer
// use a single check.
export const ENEMY_AGGRESSION_VALUES: readonly EnemyAggression[] = [
  'easy',
  'medium',
  'hard',
];

export function isEnemyAggression(v: unknown): v is EnemyAggression {
  return (
    typeof v === 'string' && (ENEMY_AGGRESSION_VALUES as readonly string[]).includes(v)
  );
}

// F-2026-06-30: P2-16 runtime whitelists + guards mirroring the
// ENEMY_AGGRESSION_VALUES / isEnemyAggression pattern above. Each
// new type gets a frozen readonly tuple (compile-time union check +
// runtime `includes` lookup) and a typed `is*` predicate so the
// validator and the editor can share a single source of truth.
export const MINIMAP_MODE_VALUES: readonly MinimapMode[] = [
  'top-right',
  'parchment',
  'hidden',
];
export const MAP_OPEN_BEHAVIOR_VALUES: readonly MapOpenBehavior[] = ['pause', 'continue'];
export const PARCHMENT_LIFECYCLE_VALUES: readonly ParchmentLifecycle[] = [
  'reset-on-death',
  'persist',
];

export function isMinimapMode(v: unknown): v is MinimapMode {
  return typeof v === 'string' && (MINIMAP_MODE_VALUES as readonly string[]).includes(v);
}

export function isMapOpenBehavior(v: unknown): v is MapOpenBehavior {
  return (
    typeof v === 'string' && (MAP_OPEN_BEHAVIOR_VALUES as readonly string[]).includes(v)
  );
}

export function isParchmentLifecycle(v: unknown): v is ParchmentLifecycle {
  return (
    typeof v === 'string' &&
    (PARCHMENT_LIFECYCLE_VALUES as readonly string[]).includes(v)
  );
}

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

// P2-6: progressive-spawn 上限输入框约束. The runtime SPAWN_SCHEDULE_DEFAULT
// already hard-codes `enabled: true` but does not bound the progressive
// upper cap (engine-side it's clamped per-tick). The UI exposes a max
// input that mirrors ENEMY_COUNT_MIN/MAX/DEFAULT naming. Declared
// BEFORE `SPAWN_SCHEDULE_DEFAULT` because the default's `max` field
// reads this constant at module-init time (the old "constants after
// the consumer" order would TDZ on first import).
//
// P3-1 fix-progressive-max: the default + the URL clamp range
// (PROGRESSIVE_MAX_MIN..PROGRESSIVE_MAX_MAX in gameUrl.ts) are the
// same source of truth the LevelSelect input consults. The default
// is 10; the URL upper cap is 20 (so a hand-crafted deep link can
// ask for a higher cap than the default). The previous spec said
// "UI mirrors ENEMY_COUNT_MAX = 10", but a long survive level can
// reasonably want more than 10 concurrent enemies; the URL clamp
// at 20 is the relaxed upper bound. Both constants are pinned
// here so a future tweak is a one-line edit.
export const SPAWN_PROGRESSIVE_MAX_DEFAULT = 10;
export const SPAWN_PROGRESSIVE_MAX_MIN = 1;
export const SPAWN_PROGRESSIVE_MAX_MAX = 20;

export const SPAWN_SCHEDULE_DEFAULT: SpawnSchedule = {
  intervalSec: 15,
  onPickup: true,
  enabled: true,
  // P3-1 fix-progressive-max: same constant the LevelSelect input
  // boxes are initialized to. Keeping a single source of truth
  // means a future bump of the default (e.g. 10 → 12) only edits
  // this one line — the URL parser's clamp and the input's clamp
  // both re-read the same number.
  max: SPAWN_PROGRESSIVE_MAX_DEFAULT,
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
  // P2-18: trap and door placement tools.
  | 'trap'
  | 'door'
  // P3-1c: 5 vertical-transition placement tools. Each tool places
  // a transition of the matching kind at the clicked cell (on the
  // editor's currentLevel). The literal names mirror
  // `TransitionKind` in `VerticalTransition`; the tool union is
  // kept separate from the data union because the toolbar's shortcut
  // map + button labels need tool-side labels and the data-side
  // shape needs the destination-layer semantics.
  | 'stair-up'
  | 'stair-down'
  | 'hole-down'
  | 'hole-up'
  | 'ladder'
  | 'pan';

// P3-1c: the subset of EditorTool that places a vertical transition.
// Re-exported from here (rather than re-declared inline at the
// toolbar / properties panel / store action sites) so adding a new
// transition tool only touches this file — every consumer (toolbar
// button list, viewport click handler, properties panel kind
// dropdown) reads the same source-of-truth list. Mirrors the
// PICKUP_TYPE_VALUES / TRAP_KIND_VALUES pattern in this file.
export type TransitionTool = Extract<
  EditorTool,
  'stair-up' | 'stair-down' | 'hole-down' | 'hole-up' | 'ladder'
>;

// P3-1c: runtime whitelist for the transition tool set. The
// transition-tool buttons in EditorToolbar are derived from this
// array (rather than a hand-rolled literal) so the union widening
// above is matched 1:1 with the toolbar's button list. The
// `as readonly TransitionTool[]` cast at the call site keeps the
// readonly-ness on the consumer side too.
export const TRANSITION_TOOL_VALUES: readonly TransitionTool[] = [
  'stair-up',
  'stair-down',
  'hole-down',
  'hole-up',
  'ladder',
];

// P3-1c: type guard for the transition-tool subset. Mirrors
// `isPickupType` / `isTrapKind` so the viewport click handler can
// route a cell click to `placeTransition(kind, x, z)` only when the
// active tool is a transition tool.
export function isTransitionTool(v: unknown): v is TransitionTool {
  return (
    typeof v === 'string' && (TRANSITION_TOOL_VALUES as readonly string[]).includes(v)
  );
}

// reject anything whose schemaVersion is not exactly this value.
export const SCHEMA_VERSION = 1 as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

