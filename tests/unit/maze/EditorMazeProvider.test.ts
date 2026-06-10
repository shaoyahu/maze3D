import { describe, it, expect } from 'vitest';
import { EditorMazeProvider } from '../../../src/maze/EditorMazeProvider';
import { JsonMazeProvider } from '../../../src/maze/JsonMazeProvider';
import type { MazeData } from '../../../src/maze/types';

// Minimal well-formed fallback level fixture.
function makeFallbackLevel(id: string): Record<string, unknown> {
  return {
    id,
    name: `Fallback ${id}`,
    size: { width: 3, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 2, z: 2 },
    walls: [
      [0, 0, 0],
      [0, 1, 0],
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
}

// Build a typed MazeData mirror of makeFallbackLevel for the custom slot.
function makeCustomLevel(id: string, name: string): MazeData {
  return {
    id,
    name,
    size: { width: 3, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 2, z: 2 },
    walls: [
      [0, 0, 0],
      [0, 1, 0],
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
}

describe('EditorMazeProvider', () => {
  it('returns the custom version when custom[id] exists', async () => {
    // Arrange
    const custom: Record<string, MazeData> = {
      'custom-1': makeCustomLevel('custom-1', 'My Custom'),
    };
    const fallback = new JsonMazeProvider({ 'fb-1': makeFallbackLevel('fb-1') });
    const provider = new EditorMazeProvider(custom, fallback);

    // Act
    const data = await provider.load('custom-1');

    // Assert
    expect(data.id).toBe('custom-1');
    expect(data.name).toBe('My Custom');
  });

  it('falls back to JsonMazeProvider when custom does not contain the id', async () => {
    // Arrange
    const custom: Record<string, MazeData> = {
      'custom-1': makeCustomLevel('custom-1', 'My Custom'),
    };
    const fallback = new JsonMazeProvider({ 'fb-1': makeFallbackLevel('fb-1') });
    const provider = new EditorMazeProvider(custom, fallback);

    // Act
    const data = await provider.load('fb-1');

    // Assert
    expect(data.id).toBe('fb-1');
    expect(data.name).toBe('Fallback fb-1');
  });

  it('merges list() with custom ids first, then fallback ids', async () => {
    // Arrange
    const custom: Record<string, MazeData> = {
      'custom-1': makeCustomLevel('custom-1', 'A'),
      'custom-2': makeCustomLevel('custom-2', 'B'),
    };
    const fallback = new JsonMazeProvider({
      'fb-1': makeFallbackLevel('fb-1'),
      'fb-2': makeFallbackLevel('fb-2'),
    });
    const provider = new EditorMazeProvider(custom, fallback);

    // Act
    const ids = await provider.list();

    // Assert
    expect(ids).toEqual(['custom-1', 'custom-2', 'fb-1', 'fb-2']);
  });

  it('keeps the fallback usable even when a custom entry would not survive validation', async () => {
    // Arrange — custom holds an entry that does not match the MazeData contract
    // (no walls, no rules). The provider trusts the Record<string, MazeData>
    // type signature, so load('custom-bad') returns it as-is. The point of
    // this test is that a broken custom entry does NOT prevent other ids
    // from being loaded via the fallback.
    const custom = {
      'custom-bad': {
        id: 'custom-bad',
        name: 'Broken',
      },
    } as unknown as Record<string, MazeData>;
    const fallback = new JsonMazeProvider({
      'only-in-fallback': makeFallbackLevel('only-in-fallback'),
    });
    const provider = new EditorMazeProvider(custom, fallback);

    // Act + Assert — fallback still works for its own ids
    const data = await provider.load('only-in-fallback');
    expect(data.id).toBe('only-in-fallback');

    // list() still merges cleanly
    const ids = await provider.list();
    expect(ids).toContain('custom-bad');
    expect(ids).toContain('only-in-fallback');
    expect(ids[0]).toBe('custom-bad');
  });
});
