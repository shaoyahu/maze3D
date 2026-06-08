import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import type { MazeData } from '../../src/maze/types';

const initialMaze: MazeData = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 2 },
  walls: [[1,1,1],[1,0,1],[1,1,1]] as MazeData['walls'],
  pickups: [],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit' as const, timeOnPickup: 15 },
};

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().goToMenu();
  });

  it('starts at the menu screen', () => {
    expect(useGameStore.getState().screen).toBe('menu');
  });

  it('startLevel transitions to playing and seeds state', () => {
    useGameStore.getState().startLevel(initialMaze);
    const s = useGameStore.getState();
    expect(s.screen).toBe('playing');
    expect(s.currentLevelId).toBe('m1');
    expect(s.timeRemaining).toBe(60);
    expect(s.health).toBe(3);
    expect(s.pickupCount).toEqual({ collected: 0, total: 0 });
  });

  it('tick decrements time', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().tick(1);
    expect(useGameStore.getState().timeRemaining).toBeCloseTo(59);
  });

  it('tick transitions to game-over at zero', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().tick(60);
    expect(useGameStore.getState().screen).toBe('game-over');
  });

  it('tick increments elapsedTime while playing', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().tick(2);
    expect(useGameStore.getState().elapsedTime).toBeCloseTo(2);
  });

  it('tick does not increment elapsedTime when paused', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().pause();
    useGameStore.getState().tick(1);
    expect(useGameStore.getState().elapsedTime).toBe(0);
  });

  it('startLevel resets elapsedTime to 0', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().tick(5);
    useGameStore.getState().startLevel(initialMaze);
    expect(useGameStore.getState().elapsedTime).toBe(0);
  });

  it('goToMenu resets elapsedTime to 0', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().tick(5);
    useGameStore.getState().goToMenu();
    expect(useGameStore.getState().elapsedTime).toBe(0);
  });

  it('pause/resume transitions are correct', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().pause();
    expect(useGameStore.getState().screen).toBe('paused');
    useGameStore.getState().resume();
    expect(useGameStore.getState().screen).toBe('playing');
  });

  it('pickup adds time and increments collected count', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.setState({ timeRemaining: 30 });
    useGameStore.getState().pickup({ x: 1, z: 1, type: 'time', value: 15 });
    const s = useGameStore.getState();
    expect(s.timeRemaining).toBe(45);
    expect(s.pickupCount.collected).toBe(1);
  });

  it('does not increment collected when inventory is full', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.setState({
      inventory: [{ x: 0, z: 0, type: 'key', value: 1 }, { x: 0, z: 0, type: 'key', value: 1 }],
    });
    useGameStore.getState().pickup({ x: 1, z: 1, type: 'key', value: 1 });
    expect(useGameStore.getState().pickupCount.collected).toBe(0);
    expect(useGameStore.getState().inventory[0]).toEqual({ x: 0, z: 0, type: 'key', value: 1 });
  });

  it('pickup with unknown type logs a warning and does not increment collected', () => {
    useGameStore.getState().startLevel(initialMaze);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Bypass the Pickup union to simulate a future type not yet handled.
    useGameStore.getState().pickup({ x: 1, z: 1, type: 'unknown' as never, value: 1 });
    expect(warnSpy).toHaveBeenCalled();
    expect(useGameStore.getState().pickupCount.collected).toBe(0);
    warnSpy.mockRestore();
  });

  it('health pickup adds health and increments collected', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.setState({ health: 1 });
    useGameStore.getState().pickup({ x: 1, z: 1, type: 'health', value: 1 });
    const s = useGameStore.getState();
    expect(s.health).toBe(2);
    expect(s.pickupCount.collected).toBe(1);
  });

  it('health pickup caps at maxHealth', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.setState({ health: 3 });
    useGameStore.getState().pickup({ x: 1, z: 1, type: 'health', value: 5 });
    expect(useGameStore.getState().health).toBe(3);
    expect(useGameStore.getState().pickupCount.collected).toBe(1);
  });

  it('damage decrements health and triggers game-over at 0', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().damage(1);
    expect(useGameStore.getState().health).toBe(2);
    useGameStore.getState().damage(2);
    expect(useGameStore.getState().screen).toBe('game-over');
  });

  it('reachExit transitions to win', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().reachExit();
    expect(useGameStore.getState().screen).toBe('win');
  });

  it('goToMenu returns to menu from any screen', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().reachExit();
    useGameStore.getState().goToMenu();
    expect(useGameStore.getState().screen).toBe('menu');
  });

  describe('useItem (P2-2 #9/#10)', () => {
    it('is a no-op when not playing', () => {
      useGameStore.setState({ useItemFlash: null });
      useGameStore.getState().useItem(0);
      expect(useGameStore.getState().useItemFlash).toBeNull();
    });

    it('bumps useItemFlash.version when the slot is filled', () => {
      useGameStore.getState().startLevel(initialMaze);
      useGameStore.setState({
        inventory: [{ x: 0, z: 0, type: 'key', value: 1 }, null],
        useItemFlash: null,
      });
      useGameStore.getState().useItem(0);
      const flash = useGameStore.getState().useItemFlash;
      expect(flash).not.toBeNull();
      expect(flash!.slot).toBe(0);
      expect(flash!.version).toBe(1);
    });

    it('increments the version on repeated use', () => {
      useGameStore.getState().startLevel(initialMaze);
      useGameStore.setState({
        inventory: [{ x: 0, z: 0, type: 'key', value: 1 }, null],
      });
      useGameStore.getState().useItem(0);
      useGameStore.getState().useItem(0);
      expect(useGameStore.getState().useItemFlash!.version).toBe(2);
    });

    it('is a no-op when the slot is empty', () => {
      useGameStore.getState().startLevel(initialMaze);
      useGameStore.setState({ inventory: [null, null], useItemFlash: null });
      useGameStore.getState().useItem(0);
      expect(useGameStore.getState().useItemFlash).toBeNull();
    });

    it('startLevel clears useItemFlash so it does not carry across runs', () => {
      useGameStore.getState().startLevel(initialMaze);
      useGameStore.setState({
        inventory: [{ x: 0, z: 0, type: 'key', value: 1 }, null],
        useItemFlash: { slot: 0, version: 5 },
      });
      useGameStore.getState().startLevel(initialMaze);
      expect(useGameStore.getState().useItemFlash).toBeNull();
    });
  });
});
