import type { MazeData } from '../../maze/types';
import { isReachable } from '../../maze/reachability';
import { getCurrentLayerWalls } from '../../utils/perLayerWalls';
import type { TVars } from '../../i18n';

// F-2026-06-17-E-M-7: issues now carry an i18n key (and optional vars)
// instead of a pre-rendered string. The status bar calls `t()` to render
// the message, so warnings follow the active language instead of always
// showing English. The `where` field stays as a raw string — it's a chip
// tag, not user-facing prose.
export interface ValidationIssue {
  severity: 'error' | 'warning';
  messageKey: string;
  messageVars?: TVars;
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
  const { start, exit, enemies, rules, tutorialSteps } = level;
  // P5-editor-multilayer: the start / exit .level field selects the
  // grid we run reachability against. P5-2 Phase 3 widens the BFS to
  // walk across `walls2d` via `transitions`; for now (Phase 1) the
  // single-layer BFS runs on the start's own layer and treats the
  // exit as reachable only when it sits on the same layer. The
  // helper handles the strict `walls xor walls2d` mutex for us.
  const walls = getCurrentLayerWalls(level, start.level ?? 0);
  const exitWalls = getCurrentLayerWalls(level, exit.level ?? 0);
  const startOnWall = walls[start.z]?.[start.x] === 1;
  const exitOnWall = exitWalls[exit.z]?.[exit.x] === 1;

  // F-2026-06-30: 'caught-by-enemy' is teaching-only. The Segmented
  // control already hides the option for non-tutorial levels, but if
  // someone imports a legacy level (or hand-edits JSON) that still has
  // it set, the status bar should flag it before save rejects it.
  // `tutorialSteps` is the only legal signal of "this is a teaching
  // level" — anything with zero steps can't justify a win-on-death.
  if (rules.victory === 'caught-by-enemy' && (tutorialSteps?.length ?? 0) === 0) {
    issues.push({
      severity: 'warning',
      messageKey: 'editor.validation.caughtByEnemyRequiresTutorial',
      where: 'rules',
    });
  }

  // Rule 1: exit reachable from start via open cells. Short-circuit the
  // BFS when either endpoint is on a wall — isReachable would just return
  // false and the actionable error (rule 4 / 5) covers the same cause.
  // P5-2: when start.level !== exit.level the BFS would need to walk
  // across `transitions` to verify reachability. Phase 1 keeps the
  // single-layer BFS; Phase 3 widens the check. We short-circuit on
  // cross-layer (returning false) so a multi-layer level still flags
  // the "exit unreachable" warning until Phase 3 lands — better to
  // surface a wrong warning than to silently mark a level valid
  // that actually can't be solved.
  const sameLayer = (start.level ?? 0) === (exit.level ?? 0);
  if (sameLayer && !startOnWall && !exitOnWall && !isReachable(walls, start, exit)) {
    issues.push({
      severity: 'warning',
      messageKey: 'editor.validation.exitUnreachable',
      where: 'exit',
    });
  }

  // (F-2026-06-17: "no pickups" 警告已砍。空关卡也是合法配置 —
  // 例如纯到达出口的极简迷宫,或教学关卡里"出谜前别打扰玩家"。
  // 原 rule 2 删除后,后续规则编号保持稳定:rule 3 = enemyPathTooShort。)

  // Rule 3: every enemy needs a patrol path of at least 2 waypoints to
  // move between. A single-point path leaves the enemy frozen on spawn.
  for (const enemy of enemies) {
    if (enemy.path.length < 2) {
      issues.push({
        severity: 'warning',
        messageKey: 'editor.validation.enemyPathTooShort',
        messageVars: { id: enemy.id },
        where: `enemy:${enemy.id}`,
      });
    }
  }

  // Rule 4: start on a wall. Emitted after the warning rules so the
  // designer sees the "exit unreachable" hint before the blocking error.
  if (startOnWall) {
    issues.push({
      severity: 'error',
      messageKey: 'editor.validation.startOnWall',
      where: 'start',
    });
  }

  // Rule 5: exit on a wall.
  if (exitOnWall) {
    issues.push({
      severity: 'error',
      messageKey: 'editor.validation.exitOnWall',
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
      messageKey: 'editor.validation.rules.initialTime',
      messageVars: { value: rules.initialTime },
      where: 'rules',
    });
  }
  if (!(rules.maxHealth > 0)) {
    issues.push({
      severity: 'error',
      messageKey: 'editor.validation.rules.maxHealth',
      messageVars: { value: rules.maxHealth },
      where: 'rules',
    });
  }
  if (!(rules.timeOnPickup > 0)) {
    issues.push({
      severity: 'error',
      messageKey: 'editor.validation.rules.timeOnPickup',
      messageVars: { value: rules.timeOnPickup },
      where: 'rules',
    });
  }

  return issues;
}
