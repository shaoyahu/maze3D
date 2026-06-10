import { describe, it, expect } from 'vitest';
import {
  HISTORY_LIMIT,
  pushHistory,
  undo,
  redo,
  canUndo,
  canRedo,
} from '../../../src/store/editorHistory';
import type { EditorState, EditorSelection } from '../../../src/store/editorHistory';
import type { MazeData, Pickup } from '../../../src/maze/types';

function makeMaze(over: Partial<MazeData> = {}): MazeData {
  return {
    id: 'm1',
    name: 'test',
    size: { width: 5, depth: 5 },
    cellSize: 1,
    start: { x: 0, z: 0 },
    exit: { x: 4, z: 4 },
    walls: [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ],
    pickups: [],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 5 },
    enemies: [],
    ...over,
  };
}

function makePickup(id: string, x: number, z: number): Pickup {
  return { id, x, z, type: 'time', value: 10 };
}

function makeState(over: Partial<EditorState> = {}): EditorState {
  return {
    level: makeMaze(),
    selection: null,
    past: [],
    future: [],
    ...over,
  };
}

const PICKUP_SEL: EditorSelection = { kind: 'pickup', id: 'p1' };
const ENEMY_SEL: EditorSelection = { kind: 'enemy', id: 'e1' };
const WALL_SEL: EditorSelection = { kind: 'wall', x: 2, z: 3 };

describe('editorHistory', () => {
  describe('pushHistory', () => {
    it('sets past.length to 1, clears future, reflects new level/selection', () => {
      // Arrange
      const nextLevel = makeMaze({ name: 'after' });
      const stateWithFuture = makeState({
        future: [{ level: makeMaze({ name: 'redo-me' }), selection: null }],
      });

      // Act
      const next = pushHistory(stateWithFuture, nextLevel, PICKUP_SEL);

      // Assert
      expect(next.past.length).toBe(1);
      expect(next.future.length).toBe(0);
      expect(next.level).toBe(nextLevel);
      expect(next.selection).toBe(PICKUP_SEL);
    });

    it('truncates past to HISTORY_LIMIT (50) after 51 pushes', () => {
      // Arrange
      let state: EditorState = makeState();
      // Act
      for (let i = 0; i < 51; i += 1) {
        state = pushHistory(state, makeMaze({ name: `m${i}` }), null);
      }
      // Assert
      expect(state.past.length).toBe(HISTORY_LIMIT);
      expect(state.future.length).toBe(0);
    });

    it('clears future when pushing after an undo (branch is cut)', () => {
      // Arrange
      let state: EditorState = makeState();
      state = pushHistory(state, makeMaze({ name: 'a' }), null);
      state = pushHistory(state, makeMaze({ name: 'b' }), null);
      state = pushHistory(state, makeMaze({ name: 'c' }), null);
      state = undo(state); // future now has 'c'
      expect(state.future.length).toBe(1);
      // Act
      state = pushHistory(state, makeMaze({ name: 'd' }), null);
      // Assert
      expect(state.future.length).toBe(0);
      expect(state.level.name).toBe('d');
    });

    it('isolates snapshots via structuredClone — mutating level after push does not corrupt history', () => {
      // Arrange
      const v1 = makeMaze({ name: 'v1', pickups: [makePickup('p1', 1, 1)] });
      let state: EditorState = makeState({ level: v1 });
      state = pushHistory(state, v1, null);
      // Act — mutate the level in place after pushing
      state.level.name = 'v1-mutated';
      state.level.pickups[0]!.x = 99;
      state.level.pickups.push(makePickup('p2', 2, 2));
      const undone = undo(state);
      // Assert — restored snapshot still reflects v1, not the mutation
      expect(undone.level.name).toBe('v1');
      expect(undone.level.pickups).toHaveLength(1);
      expect(undone.level.pickups[0]!.x).toBe(1);
    });
  });

  describe('undo', () => {
    it('pops from past, pushes current to future, restores level/selection', () => {
      // Arrange
      let state: EditorState = makeState();
      state = pushHistory(state, makeMaze({ name: 'a' }), PICKUP_SEL);
      state = pushHistory(state, makeMaze({ name: 'b' }), ENEMY_SEL);
      // Act
      const undone = undo(state);
      // Assert — 'a' snapshot pops off past (the initial-state snapshot remains
      // behind it), and the current 'b' snapshot is pushed onto future.
      expect(undone.level.name).toBe('a');
      expect(undone.selection).toBe(PICKUP_SEL);
      expect(undone.past.length).toBe(1);
      expect(undone.future.length).toBe(1);
    });

    it('returns equivalent state when past is empty (no mutation)', () => {
      // Arrange
      const state = makeState({ level: makeMaze({ name: 'current' }), selection: WALL_SEL });
      // Act
      const undone = undo(state);
      // Assert
      expect(undone).toBe(state); // pure: same reference when no-op
      expect(undone.level.name).toBe('current');
      expect(undone.selection).toBe(WALL_SEL);
    });
  });

  describe('redo', () => {
    it('pops from future, pushes current to past, restores level/selection', () => {
      // Arrange
      let state: EditorState = makeState();
      state = pushHistory(state, makeMaze({ name: 'a' }), PICKUP_SEL);
      state = pushHistory(state, makeMaze({ name: 'b' }), ENEMY_SEL);
      state = undo(state);
      // Act
      const redone = redo(state);
      // Assert — 'a' snapshot moves back onto past, future empties.
      expect(redone.level.name).toBe('b');
      expect(redone.selection).toBe(ENEMY_SEL);
      expect(redone.past.length).toBe(2);
      expect(redone.future.length).toBe(0);
    });

    it('returns equivalent state when future is empty (no mutation)', () => {
      // Arrange
      const state = makeState({ level: makeMaze({ name: 'current' }), selection: WALL_SEL });
      // Act
      const redone = redo(state);
      // Assert
      expect(redone).toBe(state);
      expect(redone.level.name).toBe('current');
      expect(redone.selection).toBe(WALL_SEL);
    });
  });

  describe('canUndo / canRedo', () => {
    it('canUndo is false on fresh state, true after a push', () => {
      // Arrange
      const fresh = makeState();
      // Act / Assert
      expect(canUndo(fresh)).toBe(false);
      const pushed = pushHistory(fresh, makeMaze(), null);
      expect(canUndo(pushed)).toBe(true);
    });

    it('canRedo is false on fresh state, true after an undo, false again after redo', () => {
      // Arrange
      let state: EditorState = makeState();
      state = pushHistory(state, makeMaze({ name: 'a' }), null);
      state = pushHistory(state, makeMaze({ name: 'b' }), null);
      expect(canRedo(state)).toBe(false);
      state = undo(state);
      expect(canRedo(state)).toBe(true);
      state = redo(state);
      expect(canRedo(state)).toBe(false);
    });
  });
});
