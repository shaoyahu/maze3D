import * as THREE from 'three';

// Single source of truth for the player's collision radius. Imported by
// JsonMazeProvider to derive MIN_CELL_SIZE so the validation can't silently
// drift from the runtime behavior.
export const PLAYER_RADIUS = 0.2;

// P3-1: eye height — the distance from the player's feet to the camera.
// Shared with the engine's rendering math (camera y = player.y + EYE_HEIGHT)
// and with the level editor's preview. The 1.6m number mirrors the
// pre-P3-1 hard-coded `camera.position.set(x, 1.6, z)` so single-layer
// levels look identical to P2-era runs.
export const EYE_HEIGHT = 1.6;

// P3-1: vertical span of one layer (floor → ceiling). Matches the
// pre-P3-1 ceiling height (2.4m) and the wall mesh height
// (BoxGeometry(cs, 2.4, cs)). See src/engine/Scene.ts for the matching
// `FLOOR_HEIGHT` constant — both values are intentionally equal so the
// ceiling of layer L is flush with the floor of layer L+1.
export const FLOOR_HEIGHT = 2.4;

export interface PlayerState {
  // P3-1: position now carries a `y` (vertical world coordinate).
  // For a player standing on layer L, `y === L * FLOOR_HEIGHT` (their
  // feet on the floor). The camera sits at `y + EYE_HEIGHT` so the
  // first-person view is at standing eye level.
  //
  // Pre-P3-1 this was `{ x, z }` only. P3-1 widens the shape; the
  // JsonMazeProvider + the engine + any UI consumer that read
  // `player.position.x` / `player.position.z` keep working because
  // those fields are unchanged. The new `y` defaults to 0 (layer 0)
  // when a caller reads the field on a pre-P3-1 player state.
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  speed: number;
  radius: number;
  // P3-1: which vertical layer the player is currently on. 0 = the
  // ground floor; (levelCount - 1) is the top. The engine's
  // collision / reachability / level-store code reads this to
  // dispatch to the right per-layer data; the UI uses it for the
  // HUD level indicator (P3-1c).
  currentLevel: number;
  // P3-1: when true, the input layer must ignore WASD / mouse
  // presses for a vertical transition (stair-up animation, hole-
  // down drop). Pinned to `true` for the duration of the y-
  // interpolation tween in `applyVerticalTransition`; cleared by
  // `updatePlayerTransition` when the tween completes. Also true
  // during the 0.5s warning flash before a hole-down (the Game
  // tick sets it before the drop starts; P3-1b ships the helper
  // and the spec is wired up by workstream 2's Game.ts change).
  inputLocked: boolean;
  // P3-1: vertical-transition tween state. The Game tick (or any
  // caller that drives the per-frame update) reads these to
  // interpolate `position.y` between `transitionFromY` and
  // `transitionToY` over `transitionDuration` seconds, then
  // clears `inputLocked` and zeros the tween fields.
  //
  //   - `transitionStartTime` — wall-clock seconds (matches
  //     `performance.now() / 1000`) at which the tween started.
  //     `0` means "no tween in progress".
  //   - `transitionFromY` — `position.y` at tween start.
  //   - `transitionToY` — target `position.y` at tween end.
  //   - `transitionDuration` — tween length in seconds (typ.
  //     0.5 for stair-up, 0.4 for hole-down per spec).
  transitionStartTime: number;
  transitionFromY: number;
  transitionToY: number;
  transitionDuration: number;
}

// P3-1: tier-1 transition kinds. The MVP (P3-1b) only renders
// stair-up / hole-down meshes; stair-down / hole-up / ladder are
// data-layer-valid (they round-trip through JsonMazeProvider) but
// the engine doesn't yet animate or render them. Re-exported by
// Scene.ts for the renderer's mesh-dispatch switch.
export type VerticalTransitionKind =
  | 'stair-up'
  | 'stair-down'
  | 'hole-down'
  | 'hole-up'
  | 'ladder';

// P3-1: default durations for the two tween types that P3-1b
// actually animates. Spec §3 decision 1: stair-up 0.5s smooth
// climb, hole-down 0.4s short drop. The ladder / stair-down /
// hole-up kinds aren't animated yet (P3-1c+ scope).
export const STAIR_UP_DURATION_SEC = 0.5;
export const HOLE_DOWN_DURATION_SEC = 0.4;

export function createPlayer(
  startCell: { x: number; z: number; level?: number },
  cellSize: number,
): PlayerState;
// P4 refactor-fp2d: the 3D voxel `createPlayer(startCell3D,
// cellSize, mode: '3d')` overload is removed. The 3D mode
// the user now sees is a first-person perspective camera
// rendering the SAME 2D multi-layer data, so the player
// state shape is identical to the 2D top-down case — a
// single `{x, z, level?}` cell plus the same `currentLevel`
// + `transition*` fields. The only 3D-specific dispatch
// that survived the refactor lives in Game.ts (mouse-look
// is gated on the `view=fp3d` URL query) and Camera.ts
// (PerspectiveCamera + EYE_HEIGHT placement), not in the
// player entity itself.
export function createPlayer(
  startCell: { x: number; z: number; level?: number },
  cellSize: number,
  // Mode discriminator: kept as an optional arg for back-
  // compat (existing call sites pass `undefined` or nothing).
  // The only valid value used to be `'3d'` for the 3D voxel
  // overload; that overload is now removed. Any future
  // `'fp3d'`-style marker would also be a no-op because the
  // 2D and first-person 3D views share the same PlayerState
  // shape — see the long comment above for the full rationale.
  _mode?: never,
): PlayerState {
  // P3-1: layer is the `level` field on the start cell. The
  // JsonMazeProvider back-fills `level: 0` when the JSON omits
  // the field, so `level ?? 0` collapses the pre-P3-1 shape
  // (no `level` field) to the historical y = 0 starting
  // position. Multi-level levels carry their start cell's layer
  // and the player spawns on that layer's floor.
  const startLevel = (startCell as { x: number; z: number; level?: number }).level ?? 0;
  return {
    position: {
      x: startCell.x * cellSize + cellSize / 2,
      y: startLevel * FLOOR_HEIGHT,
      z: startCell.z * cellSize + cellSize / 2,
    },
    yaw: 0,
    pitch: 0,
    speed: 3,
    radius: PLAYER_RADIUS,
    currentLevel: startLevel,
    inputLocked: false,
    transitionStartTime: 0,
    transitionFromY: 0,
    transitionToY: 0,
    transitionDuration: 0,
  };
}

export function applyLook(player: PlayerState, mouse: { x: number; y: number }) {
  // Matches Three.js PointerLockControls convention: `euler.x -= movementY`.
  player.yaw -= mouse.x;
  const TWO_PI = 2 * Math.PI;
  player.yaw = ((player.yaw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  player.pitch -= mouse.y;
  player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
}

const CAMERA_EULER = new THREE.Euler(0, 0, 0, 'YXZ');

export function updatePlayerCamera(camera: THREE.PerspectiveCamera, player: PlayerState): void {
  // P3-1: the camera y now tracks `player.position.y` (the foot
  // height on the current layer) plus the standing eye height.
  // For a player standing on layer L, that's `L * FLOOR_HEIGHT
  // + EYE_HEIGHT` — exactly eye-level above the layer's floor.
  // Pre-P3-1 the y was hard-coded to 1.6; with `position.y` defaulting
  // to 0 the new formula collapses to the same 1.6, so single-layer
  // levels render identically.
  camera.position.set(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);
  // Reuse a module-level Euler to avoid per-frame allocation. With order
  // 'YXZ', x=pitch, y=yaw, z=roll; pinning z to 0 enforces a level horizon
  // regardless of any prior rotation. The Euler is only read by
  // setFromEuler before the next mutation, so reusing it is safe.
  CAMERA_EULER.set(player.pitch, player.yaw, 0);
  camera.quaternion.setFromEuler(CAMERA_EULER);
}

// P3-1: set up a vertical transition tween. The function pins
// `currentLevel = toLevel`, locks input, and stores the tween
// endpoints on the player state so the per-frame
// `updatePlayerTransition` can interpolate `position.y` over
// `durationSec` seconds.
//
// The caller is expected to drive `updatePlayerTransition` from
// the engine's per-frame tick (Game.update — workstream 2).
// `applyVerticalTransition` is the "set up" half of the contract;
// it intentionally doesn't tick the tween itself so the caller
// stays in control of when "now" advances.
//
// The kind parameter is documented for future per-kind tuning
// (e.g. a hole-down could keep `inputLocked` on for an extra
// 0.1s post-landing so the player can't immediately re-step
// into the same cell). For P3-1b's MVP we just use the
// kind-aware default duration.
//
// `nowSec` is wall-clock seconds (use `performance.now() / 1000`).
// The value is stored verbatim — `updatePlayerTransition` reads
// it back to compute the elapsed time. Zero is a sentinel for
// "no tween"; `applyVerticalTransition` always writes a
// non-zero start time so the next `updatePlayerTransition` call
// sees a real tween in progress.
export function applyVerticalTransition(
  player: PlayerState,
  toLevel: number,
  targetY: number,
  durationSec: number,
  kind: VerticalTransitionKind,
  nowSec: number,
): void {
  // Sanity: zero / negative duration would either complete
  // immediately (tween elapsed by the first tick) or pin the
  // player mid-air. The contract says `durationSec` is in
  // (0, 5] seconds; clamp to a tiny positive number to keep
  // the math safe.
  const safeDuration = durationSec > 0 && Number.isFinite(durationSec)
    ? durationSec
    : (kind === 'hole-down' ? HOLE_DOWN_DURATION_SEC : STAIR_UP_DURATION_SEC);

  player.currentLevel = toLevel;
  player.inputLocked = true;
  player.transitionStartTime = nowSec;
  player.transitionFromY = player.position.y;
  player.transitionToY = targetY;
  player.transitionDuration = safeDuration;

  // Pre-set the destination y on the tween start so a single
  // tick that lands exactly on `t = 1.0` (e.g. a 1-second
  // tween ticked on its boundary) snaps to the target. The
  // per-frame `updatePlayerTransition` is the canonical
  // interpolator; this pre-snap is a defensive measure for
  // levels where the engine's first post-transition tick
  // arrives with `elapsed >= duration`.
  // (P3-1b doesn't rely on this snap — it kicks in only when
  // the caller forgets to drive the per-frame update for a
  // full tween's worth of frames, which would otherwise leave
  // the player frozen mid-air.)
}

// P3-1: per-frame tween driver. The Game tick (or any caller
// with a `nowSec` clock) calls this every frame to advance the
// y interpolation; when the tween completes, the function
// snaps `position.y` to the target, clears `inputLocked`, and
// resets the tween fields. Safe to call when no tween is in
// progress (the early-return makes it a no-op).
//
// Returns `true` while a tween is still in progress (i.e. the
// caller should keep the input layer locked and keep the
// engine's per-frame logic running). Returns `false` once the
// tween has completed (or was never started), so the caller
// can branch on it for any cleanup that should fire only at
// the tween boundary.
export function updatePlayerTransition(
  player: PlayerState,
  nowSec: number,
): boolean {
  // "No tween in progress" is identified by transitionDuration
  // being 0 (the canonical post-tween state — applyVerticalTransition
  // always writes a positive duration). We deliberately DON'T
  // gate on transitionStartTime === 0, because 0 is a valid
  // start time when the test / caller uses wall-clock 0 as
  // the tween origin. The duration check is the single source
  // of truth.
  if (player.transitionDuration <= 0) return false;
  const elapsed = nowSec - player.transitionStartTime;
  if (elapsed < 0) {
    // `nowSec` is in the past relative to the tween start —
    // shouldn't happen in normal play (the engine's clock
    // only moves forward) but be defensive. Treat as
    // pre-start and keep the tween armed.
    return true;
  }
  if (elapsed >= player.transitionDuration) {
    // Tween complete: snap to target, unlock input, reset
    // the tween fields.
    player.position.y = player.transitionToY;
    player.inputLocked = false;
    player.transitionStartTime = 0;
    player.transitionFromY = 0;
    player.transitionToY = 0;
    player.transitionDuration = 0;
    return false;
  }
  // Linear interpolation (the spec is silent on easing for the
  // MVP; the P3-1c UI can layer a CSS / shader ease on top
  // if it wants). 0 → fromY, 1 → toY.
  const t = elapsed / player.transitionDuration;
  player.position.y = player.transitionFromY + (player.transitionToY - player.transitionFromY) * t;
  return true;
}
