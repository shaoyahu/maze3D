import { resolveMove, type WallGrid } from '../engine/Collision';
import type { EnemySpawn, EnemyState } from '../maze/types';

export const ENEMY_DWELL_TIME_DEFAULT = 1.0;
export const ENEMY_FOV_RANGE_DEFAULT = 3;
export const ENEMY_FOV_ANGLE_DEG_DEFAULT = 60;
export const ENEMY_PATROL_SPEED_RATIO = 0.6;
export const ENEMY_CHASE_ALERT_SECONDS = 0.5;
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

  state: EnemyState = 'patrol';
  currentTarget: number;
  dwellTimer = 0;
  alertTimer = 0;
  heading: Vec2;
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
    this.id = spawn.id;
    this.position = { x: spawn.x, z: spawn.z };
    this.path = spawn.path;
    this.dwellTime = spawn.dwellTime ?? ENEMY_DWELL_TIME_DEFAULT;
    this.fovRange = spawn.fovRange ?? ENEMY_FOV_RANGE_DEFAULT;
    this.fovAngleDeg = spawn.fovAngleDeg ?? ENEMY_FOV_ANGLE_DEG_DEFAULT;
    this.patrolSpeed = options.playerSpeed * ENEMY_PATROL_SPEED_RATIO;
    this.chaseMultiplier = options.chaseMultiplier;
    this.chaseSpeed = options.playerSpeed * options.chaseMultiplier;
    this.currentTarget = 0;
    this.heading = headingToward(this.position, this.path[0]);
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
        this.tickDwell(dt);
        if (this.canSeePlayer(player)) this.enterChase();
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
    const next = resolveMove(
      { x: this.position.x, z: this.position.z, r: ENEMY_RADIUS },
      { dx: (dx / dist) * step, dz: (dz / dist) * step },
      this.grid,
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
  }

  private enterPatrol(): void {
    this.state = 'patrol';
    this.alertTimer = 0;
    this.heading = headingToward(this.position, this.path[this.currentTarget]);
  }
}

function headingToward(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < ARRIVAL_EPSILON) return { x: 1, z: 0 };
  return { x: dx / dist, z: dz / dist };
}
