import type { MazeData } from '../../maze/types';
import { isReachable } from '../../maze/reachability';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  where?: string;
}

// Pure function: no React, no store, no Three.js. The editor's "design
// warnings" UI consumes this and decides whether to surface each issue.
// Save is never blocked by this function — `JsonMazeProvider.validateMaze`
// is the gatekeeper for hard structural errors.
//
// Rule order is part of the contract: the UI renders issues top-down and
// stable ordering keeps the layout predictable. Rules are checked in
// numerical order (1, 2, 3, 4, 5), each appearing at most once.
export function validateDesign(level: MazeData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { walls, start, exit, pickups, enemies, rules } = level;
  const startOnWall = walls[start.z]?.[start.x] === 1;
  const exitOnWall = walls[exit.z]?.[exit.x] === 1;

  // Rule 1: exit reachable from start via open cells. Short-circuit the
  // BFS when either endpoint is on a wall — isReachable would just return
  // false and the actionable error (rule 4 / 5) covers the same cause.
  if (!startOnWall && !exitOnWall && !isReachable(walls, start, exit)) {
    issues.push({
      severity: 'warning',
      message: 'Exit is unreachable from the start cell',
      where: 'exit',
    });
  }

  // Rule 2: no pickups means no time/health to collect — flag for the
  // designer without blocking save.
  if (pickups.length === 0) {
    issues.push({
      severity: 'warning',
      message: 'Level has no pickups',
      where: 'pickups',
    });
  }

  // Rule 3: every enemy needs a patrol path of at least 2 waypoints to
  // move between. A single-point path leaves the enemy frozen on spawn.
  for (const enemy of enemies) {
    if (enemy.path.length < 2) {
      issues.push({
        severity: 'warning',
        message: `Enemy ${enemy.id} has a patrol path with fewer than 2 waypoints`,
        where: `enemy:${enemy.id}`,
      });
    }
  }

  // Rule 4: start on a wall. Emitted after the warning rules so the
  // designer sees the "no pickups" hint before the blocking error.
  if (startOnWall) {
    issues.push({
      severity: 'error',
      message: 'Start cell is on a wall',
      where: 'start',
    });
  }

  // Rule 5: exit on a wall.
  if (exitOnWall) {
    issues.push({
      severity: 'error',
      message: 'Exit cell is on a wall',
      where: 'exit',
    });
  }

  // F-2026-06-15-M-4.2: rules range checks. JsonMazeProvider.validateMaze
  // rejects each of these at save time with a structural error; surfacing
  // them as design warnings here lets the editor flag them before the user
  // tries to save and gets a vague "validation failed" toast.
  if (!(rules.initialTime > 0)) {
    issues.push({
      severity: 'error',
      message: `rules.initialTime must be > 0 (got ${rules.initialTime})`,
      where: 'rules',
    });
  }
  if (!(rules.maxHealth > 0)) {
    issues.push({
      severity: 'error',
      message: `rules.maxHealth must be > 0 (got ${rules.maxHealth})`,
      where: 'rules',
    });
  }
  if (!(rules.timeOnPickup > 0)) {
    issues.push({
      severity: 'error',
      message: `rules.timeOnPickup must be > 0 (got ${rules.timeOnPickup})`,
      where: 'rules',
    });
  }

  return issues;
}
