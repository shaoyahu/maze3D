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
  };
  return { ...base, ...over };
}

describe('validateDesign', () => {
  it('returns [] for a clean level', () => {
    // Arrange — a level with at least one pickup is "clean": no rule fires.
    // (The base fixture has no pickups, which would trigger rule 2.)
    const level = makeLevel({
      pickups: [{ id: 'p1', x: 0, z: 0, type: 'time', value: 10 }],
    });

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
      message: expect.stringContaining('unreachable'),
      where: 'exit',
    });
  });

  it('emits a "no pickups" warning when pickups array is empty', () => {
    // Arrange
    const level = makeLevel({ pickups: [] });

    // Act
    const issues = validateDesign(level);

    // Assert
    expect(issues).toContainEqual({
      severity: 'warning',
      message: expect.stringContaining('pickup'),
      where: 'pickups',
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
      message: expect.stringContaining('path'),
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
      message: expect.stringContaining('Start'),
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
      message: expect.stringContaining('Exit'),
      where: 'exit',
    });
  });

  it('returns multiple issues in rule order', () => {
    // Arrange — trigger 3 different issues:
    //   rule 2 (no pickups),
    //   rule 3 (enemy with path.length 1),
    //   rule 4 (start on wall)
    // We deliberately keep exit off a wall and reachable so rule 1 does not
    // appear; this pins the assertion to a known slice of the rule list.
    const level = makeLevel({
      start: { x: 1, z: 1 },
      walls: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
      pickups: [],
      enemies: [{ id: 'e7', x: 0, z: 0, path: [{ x: 0, z: 0 }] }],
    });

    // Act
    const issues = validateDesign(level);

    // Assert — at least 3 issues, in order: pickups, enemy:e7, start
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.map((i) => i.where)).toEqual([
      'pickups',
      'enemy:e7',
      'start',
    ]);
  });
});
