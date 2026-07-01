import { describe, it, expect } from 'vitest';
import { validateDesign } from '../../../../src/ui/editor/editorValidation';
import type { MazeData } from '../../../../src/maze/types';

// Minimal well-formed 3x3 all-open level. Each test mutates one or more
// fields to exercise a single rule in isolation; this avoids shared-fixture
// bleed-through that could mask order-dependent bugs.
function makeLevel(over: Partial<MazeData> = {}): MazeData {
  const base: MazeData = {
    id: 'test-level',
    name: 'Test Level',
    size: { width: 3, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 2, z: 2 },
    walls: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    pickups: [],
    rules: {
      initialTime: 60,
      maxHealth: 3,
      victory: 'reach-exit',
      timeOnPickup: 10,
    },
    enemies: [],
    traps: [],
    doors: [],
  };
  return { ...base, ...over };
}

describe('validateDesign', () => {
  it('returns [] for a clean level', () => {
    // Arrange — base fixture already passes: reachable start↔exit, no
    // enemies, default rules, even an empty pickups array (F-2026-06-17
    // removed the "no pickups" warning — empty levels are legal).
    const level = makeLevel();

    // Act
    const issues = validateDesign(level);

    // Assert
    expect(issues).toEqual([]);
  });

  it('emits an "exit unreachable" warning when a wall ring isolates the exit', () => {
    // Arrange — walls form a ring around (2,2), leaving start at (0,0) cut off
    const level = makeLevel({
      walls: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 1, 0],
      ],
    });

    // Act
    const issues = validateDesign(level);

    // Assert
    expect(issues).toContainEqual({
      severity: 'warning',
      messageKey: 'editor.validation.exitUnreachable',
      where: 'exit',
    });
  });

  it('emits an enemy warning when an enemy has path.length < 2', () => {
    // Arrange — enemy with a 1-point path
    const level = makeLevel({
      enemies: [{ id: 'e1', x: 1, z: 1, path: [{ x: 1, z: 1 }] }],
    });

    // Act
    const issues = validateDesign(level);

    // Assert
    expect(issues).toContainEqual({
      severity: 'warning',
      messageKey: 'editor.validation.enemyPathTooShort',
      messageVars: { id: 'e1' },
      where: 'enemy:e1',
    });
  });

  it('emits a "start on wall" error', () => {
    // Arrange
    const level = makeLevel({
      start: { x: 1, z: 1 },
      walls: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
    });

    // Act
    const issues = validateDesign(level);

    // Assert
    expect(issues).toContainEqual({
      severity: 'error',
      messageKey: 'editor.validation.startOnWall',
      where: 'start',
    });
  });

  it('emits an "exit on wall" error', () => {
    // Arrange
    const level = makeLevel({
      exit: { x: 1, z: 1 },
      walls: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
    });

    // Act
    const issues = validateDesign(level);

    // Assert
    expect(issues).toContainEqual({
      severity: 'error',
      messageKey: 'editor.validation.exitOnWall',
      where: 'exit',
    });
  });

  it('returns multiple issues in rule order', () => {
    // Arrange — trigger 2 different issues:
    //   rule 3 (enemy with path.length 1),
    //   rule 4 (start on wall)
    // We deliberately keep exit off a wall and reachable so rule 1 does
    // not appear; this pins the assertion to a known slice of the rule
    // list. F-2026-06-17: "no pickups" rule 2 was removed, so we no
    // longer pre-seed an empty pickups array to inflate the count.
    const level = makeLevel({
      start: { x: 1, z: 1 },
      walls: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
      enemies: [{ id: 'e7', x: 0, z: 0, path: [{ x: 0, z: 0 }] }],
    });

    // Act
    const issues = validateDesign(level);

    // Assert — at least 2 issues, in order: enemy:e7, start
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.map((i) => i.where)).toEqual([
      'enemy:e7',
      'start',
    ]);
  });

  // F-2026-06-30: 'caught-by-enemy' is teaching-only. A non-tutorial
  // level that wins on death is a misconfigured level — flag it on the
  // design-warnings status bar so the author sees the issue before
  // JsonMazeProvider.validateMaze rejects the save.
  it('warns when caught-by-enemy is selected without tutorial steps', () => {
    const level = makeLevel({
      rules: {
        initialTime: 60,
        maxHealth: 3,
        victory: 'caught-by-enemy',
        timeOnPickup: 10,
      },
    });

    const issues = validateDesign(level);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'warning',
      messageKey: 'editor.validation.caughtByEnemyRequiresTutorial',
      where: 'rules',
    });
  });

  it('does NOT warn when caught-by-enemy is paired with tutorial steps', () => {
    // The 哨兵回廊 teaching-03 lesson is the one legitimate use of
    // caught-by-enemy; validateDesign must stay quiet in that case.
    const level = makeLevel({
      rules: {
        initialTime: 60,
        maxHealth: 3,
        victory: 'caught-by-enemy',
        timeOnPickup: 10,
      },
      tutorialSteps: [
        {
          id: 's1',
          messageKey: 'tutorial.steps.s1',
          trigger: { type: 'reached-exit' },
        },
      ],
    });

    expect(validateDesign(level)).toEqual([]);
  });
});
