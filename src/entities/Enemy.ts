import { resolveMove, type WallGrid } from '../engine/Collision';
import type { EnemySpawn, EnemyState } from '../maze/types';

const ENEMY_DWELL_TIME_DEFAULT = 1.0;
const ENEMY_FOV_RANGE_DEFAULT = 3;
const ENEMY_FOV_ANGLE_DEG_DEFAULT = 60;
const ENEMY_PATROL_SPEED_RATIO = 0.6;
const ENEMY_CHASE_ALERT_SECONDS = 0.5;
export const ENEMY_RADIUS = 0.35;
export const ENEMY_HEIGHT = 1.6;

export interface EnemyPlayerRef {
  position: { x: number; z: number };
}

export interface EnemyOptions {
  playerSpeed: number;
  chaseMultiplier: number;
}

interface Vec2 {
  x: number;
  z: number;
}

const ARRIVAL_EPSILON = 1e-6;

export class Enemy {
  readonly id: string;
  position: Vec2;
  readonly path: ReadonlyArray<Vec2>;
  readonly dwellTime: number;
  readonly fovRange: number;
  readonly fovAngleDeg: number;
  readonly patrolSpeed: number;
  readonly chaseMultiplier: number;
  readonly chaseSpeed: number;
  // P1-7: per-instance color chase flash. P1-4 shared the
  // body / arms material across all enemies (the wall/pickup
  // pattern). P1-7 un-shares body + arms so the Game tick can
  // lerp each enemy's body color independently when it enters
  // chase state (0.3s linear ramp base → red), and fade back
  // to base on chase exit (0.5s linear ramp red → base). The
  // state machine drives `startColorFlash('red')` /
  // `startColorFlash('base')`; the lerp runs every frame until
  // the ramp completes, then nulls out (no per-frame
  // allocation past the start). Mirrors the activeTransition
  // P3-1 pattern.
  colorRamp: { startMs: number; durationSec: number; from: number; to: number } | null = null;

  state: EnemyState = 'patrol';
  currentTarget: number;
  dwellTimer = 0;
  alertTimer = 0;
  heading: Vec2;
  // P3-1: which layer this enemy patrols on. Defaults to 0 for every
  // pre-P3-1 level (JsonMazeProvider / AlgorithmMazeProvider both
  // back-fill the field on load / generation). Per spec §5.3 / H2, an
  // enemy only collides with a player on the same layer; cross-layer
  // pairs are silently skipped at the Collision layer (see
  // playerVsEnemy / hasEnemyContact).
  readonly level: number;
  // F2 (P0): wall-aware movement. The grid is captured at construction;
  // Enemy is recreated per level (see Game.startLevel) so the closure over
  // the active maze stays valid for the enemy's lifetime. The grid's `get`
  // is a live read into the active maze's wall array — no per-frame wiring
  // needed in Game.update.
  private readonly grid: WallGrid;

  constructor(spawn: EnemySpawn, options: EnemyOptions, grid: WallGrid) {
    if (spawn.path.length < 2) {
      throw new Error(
        `Enemy ${spawn.id}: path must have at least 2 nodes (got ${spawn.path.length})`,
      );
    }
    // F-2026-06-17-C-H-2: the first patrol node must live in the same
    // cell as the spawn (or in a directly adjacent one). Validators above
    // (JsonMazeProvider.parseEnemies, EditorMazeProvider) are the primary
    // line of defense, but a hand-crafted JSON or a future provider that
    // forgets the check can still hand us a spawn that disagrees with
    // path[0]. Without this guard, the enemy's first frame is drawn with
    // a heading computed from a far-away point (headingToward would
    // produce a non-zero vector even if the FOV cone ends up pointing
    // somewhere plausible) and the patrol "snaps" on its first tick —
    // visibly wrong on the very first frame the enemy is on screen.
    const first = spawn.path[0];
    if (first === undefined) {
      // Already excluded by the length<2 check above, but TS can't narrow
      // it without an explicit branch; the throw keeps the type honest.
      throw new Error(`Enemy ${spawn.id}: path[0] is undefined`);
    }
    if (Math.hypot(spawn.x - first.x, spawn.z - first.z) > grid.cellSize) {
      throw new Error(
        `Enemy ${spawn.id}: spawn (${spawn.x},${spawn.z}) is more than one cell (cellSize=${grid.cellSize}) away from path[0] (${first.x},${first.z})`,
      );
    }
    this.id = spawn.id;
    this.position = { x: spawn.x, z: spawn.z };
    this.path = spawn.path;
    // P3-1: read the layer once at construction so the per-frame
    // resolveMove can pass it to the wall lookup. `?? 0` is the
    // single-layer back-compat — pre-P3-1 JSON without `level` is
    // implicitly layer 0 (see JsonMazeProvider.parseEntityLevel).
    this.level = spawn.level ?? 0;
    this.dwellTime = spawn.dwellTime ?? ENEMY_DWELL_TIME_DEFAULT;
    this.fovRange = spawn.fovRange ?? ENEMY_FOV_RANGE_DEFAULT;
    this.fovAngleDeg = spawn.fovAngleDeg ?? ENEMY_FOV_ANGLE_DEG_DEFAULT;
    this.patrolSpeed = options.playerSpeed * ENEMY_PATROL_SPEED_RATIO;
    this.chaseMultiplier = options.chaseMultiplier;
    this.chaseSpeed = options.playerSpeed * options.chaseMultiplier;
    // F-2026-06-16-L-3: start with path[1] (the second node), not
    // path[0]. path[0] is the spawn cell and is identical to
    // this.position, so `headingToward(this.position, this.path[0])`
    // would see a zero distance and fall back to the {x:1, z:0} east
    // default. That meant the enemy's FOV cone pointed east regardless
    // of where the patrol actually went — the first tickPatrol step
    // would update the heading, but for the first frame (and any frame
    // the enemy sat at a node waiting for the next path step) the
    // FOV was wrong. path[1] is guaranteed to exist because the
    // constructor above rejects `spawn.path.length < 2`.
    this.currentTarget = 1;
    this.heading = headingToward(this.position, this.path[1]);
    this.grid = grid;
  }

  update(dt: number, player: EnemyPlayerRef): void {
    if (dt <= 0) return;
    switch (this.state) {
      case 'patrol': {
        this.tickPatrol(dt);
        if (this.canSeePlayer(player)) this.enterChase();
        break;
      }
      case 'dwell': {
        // F-N7: check canSeePlayer BEFORE tickDwell. Previously the
        // order was reversed — tickDwell could call advanceTarget when
        // the timer hit 0, which resets heading toward the next patrol
        // node. canSeePlayer would then check against the new heading
        // and miss the player who was in the old FOV cone the entire
        // dwell. Checking first ensures enterChase wins if the player
        // is visible, before any heading change.
        if (this.canSeePlayer(player)) this.enterChase();
        this.tickDwell(dt);
        break;
      }
      case 'chase': {
        this.tickChase(dt, player);
        if (this.canSeePlayer(player)) {
          this.alertTimer = ENEMY_CHASE_ALERT_SECONDS;
        } else {
          this.alertTimer -= dt;
          if (this.alertTimer <= 0) this.enterPatrol();
        }
        break;
      }
    }
  }

  canSeePlayer(player: EnemyPlayerRef): boolean {
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > this.fovRange * this.fovRange) return false;
    if (distSq < 1e-8) return true;
    const dist = Math.sqrt(distSq);
    const dirX = dx / dist;
    const dirZ = dz / dist;
    const dot = this.heading.x * dirX + this.heading.z * dirZ;
    if (dot >= 1) return true;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    return angle <= (this.fovAngleDeg * Math.PI) / 360;
  }

  private tickPatrol(dt: number): void {
    const target = this.path[this.currentTarget];
    const reached = this.moveToward(target, this.patrolSpeed * dt);
    if (reached) this.enterDwell();
  }

  private tickDwell(dt: number): void {
    this.dwellTimer -= dt;
    if (this.dwellTimer <= 0) this.advanceTarget();
  }

  private tickChase(dt: number, player: EnemyPlayerRef): void {
    this.moveToward(player.position, this.chaseSpeed * dt);
  }

  private moveToward(target: Vec2, stepDist: number): boolean {
    if (stepDist <= 0) return false;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVAL_EPSILON) return true;
    const step = Math.min(stepDist, dist);
    // F2 (P0): wall-aware stepping via Collision.resolveMove. The pre-fix
    // code added the unit vector scaled by `step` directly to the position,
    // so a 1.6m wall between the enemy and its target vanished within a
    // second of chase. We now reuse the same per-axis try-move the player
    // uses, which stops the enemy at the wall (and lets the unblocked
    // axis slide along it, matching the player's behavior).
    //
    // P3-1: the enemy's layer (`this.level`) is passed to resolveMove
    // so wall lookups happen on the right grid. Pre-P3-1 enemies had
    // no `level` field, so the property is `?? 0` for back-compat
    // (every pre-P3-1 level is implicitly layer 0).
    const next = resolveMove(
      { x: this.position.x, z: this.position.z, r: ENEMY_RADIUS },
      { dx: (dx / dist) * step, dz: (dz / dist) * step },
      this.grid,
      this.level ?? 0,
    );
    this.position.x = next.x;
    this.position.z = next.z;
    this.heading.x = dx / dist;
    this.heading.z = dz / dist;
    // F2 (P0): "reached" is now "actually close to target", not "had a big
    // enough step budget this frame". The pre-fix `step >= dist` check
    // returned true for any frame where stepDist exceeded the target
    // distance, even when a wall blocked the move — which would loop the
    // patrol into an instant dwell at the spawn cell. With wall-aware
    // stepping, a blocked target is never "reached" and the enemy stays
    // in patrol/chase from its blocked position until the path clears.
    // P3-1: enemies are pinned to a single layer (see `EnemySpawn.level`,
    // spec §5.3 / H2). The Enemy instance's `level` is read at construction
    // and passed to `resolveMove` so the wall lookup hits the correct
    // layer. Pre-P3-1 enemies (no `level` field) read 0 — the
    // single-layer back-compat path that all existing tests rely on.
    return Math.hypot(target.x - this.position.x, target.z - this.position.z) < ARRIVAL_EPSILON;
  }

  private enterDwell(): void {
    this.state = 'dwell';
    this.dwellTimer = this.dwellTime;
  }

  private advanceTarget(): void {
    this.state = 'patrol';
    this.currentTarget = (this.currentTarget + 1) % this.path.length;
    this.heading = headingToward(this.position, this.path[this.currentTarget]);
  }

  private enterChase(): void {
    this.state = 'chase';
    this.alertTimer = ENEMY_CHASE_ALERT_SECONDS;
    // P1-7: kick the body color ramp toward red. The Game
    // tick reads colorRamp + the per-enemy material's current
    // color, so the lerp continues across frames until the
    // 0.3s ramp completes. From color is captured at
    // startColorFlash time so a fresh enterChase mid-ramp
    // (e.g. a fast patrol → chase → patrol → chase loop)
    // doesn't jump — it picks up wherever the body was.
    this.startColorFlash(0xff0000, 0.3);
  }

  private enterPatrol(): void {
    this.state = 'patrol';
    // P1-7: fade back to base color on chase exit. 0.5s
    // linear ramp so the color doesn't punch out (the
    // heartbeat audio fades 0.5s too, parallel UX).
    this.startColorFlash(0x553333, 0.5);
    this.alertTimer = 0;
    this.heading = headingToward(this.position, this.path[this.currentTarget]);
  }

  // P1-7: kick a color ramp. Called from enterChase / enterPatrol.
  // The Game tick reads `this.colorRamp` and lerps the per-enemy
  // material color from `from` (captured at start time) to `to`
  // over `durationSec` seconds. The ramp auto-clears on completion
  // so the per-frame check is just a null comparison; we don't
  // pay for an allocation once the lerp finishes.
  //
  // `from` is intentionally NOT a parameter — the Game tick
  // snapshots the material's *current* color at lerp time, so
  // re-entering chase mid-ramp picks up wherever the body
  // actually is (avoids a snap on rapid state flips).
  startColorFlash(toColor: number, durationSec: number): void {
    this.colorRamp = {
      startMs: performance.now(),
      durationSec,
      from: 0, // placeholder; the Game tick reads the live material color
      to: toColor,
    };
  }
}

function headingToward(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < ARRIVAL_EPSILON) return { x: 1, z: 0 };
  return { x: dx / dist, z: dz / dist };
}
