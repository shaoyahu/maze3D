import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import type { MazeData, Pickup } from '../../src/maze/types';

const initialMaze: MazeData = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 2 },
  walls: [[1,1,1],[1,0,1],[1,1,1]] as MazeData['walls'],
  pickups: [],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit' as const, timeOnPickup: 15 },
  enemies: [],
  traps: [],
  doors: [],
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
    useGameStore.getState().pickup({ id: crypto.randomUUID(), x: 1, z: 1, type: 'time', value: 15 });
    const s = useGameStore.getState();
    expect(s.timeRemaining).toBe(45);
    expect(s.pickupCount.collected).toBe(1);
  });

  it('time pickup uses p.value when it differs from rules.timeOnPickup (F5 regression)', () => {
    // Regression (F5): the old `s.currentMaze?.rules.timeOnPickup ?? p.value`
    // made `p.value` dead code because validateMaze forces
    // `timeOnPickup` to be a finite positive number. With p.value=20
    // and rules.timeOnPickup=15 the bonus must be 20, not 15.
    useGameStore.getState().startLevel(initialMaze); // timeOnPickup: 15
    useGameStore.setState({ timeRemaining: 30 });
    useGameStore.getState().pickup({ id: crypto.randomUUID(), x: 1, z: 1, type: 'time', value: 20 });
    const s = useGameStore.getState();
    expect(s.timeRemaining).toBe(50); // 30 + 20 (p.value), not 30 + 15 (rules)
    expect(s.pickupCount.collected).toBe(1);
  });

  it('time pickup in non-survive mode does NOT modify currentSurviveSeconds (F5 contract)', () => {
    // Regression guard: the survive-mode branch must only fire in survive
    // mode. In reach-exit / time-trial the field is irrelevant and must
    // stay at its level default — otherwise the next startLevel call would
    // inherit a polluted surviveSeconds.
    useGameStore.getState().startLevel(initialMaze); // reach-exit / time-trial
    const surviveBefore = useGameStore.getState().currentSurviveSeconds;
    useGameStore.getState().pickup({ id: crypto.randomUUID(), x: 1, z: 1, type: 'time', value: 20 });
    expect(useGameStore.getState().currentSurviveSeconds).toBe(surviveBefore);
    expect(useGameStore.getState().timeRemaining).toBe(80); // 60 (initial) + 20
  });

  it('does not increment collected when inventory is full', () => {
    useGameStore.getState().startLevel(initialMaze);
    const keyA: Pickup = { id: crypto.randomUUID(), x: 0, z: 0, type: 'key', value: 1 };
    const keyB: Pickup = { id: crypto.randomUUID(), x: 0, z: 0, type: 'key', value: 1 };
    useGameStore.setState({ inventory: [keyA, keyB] });
    useGameStore.getState().pickup({ id: crypto.randomUUID(), x: 1, z: 1, type: 'key', value: 1 });
    expect(useGameStore.getState().pickupCount.collected).toBe(0);
    expect(useGameStore.getState().inventory[0]).toEqual(keyA);
  });

  it('pickup with unknown type logs a warning and does not increment collected', () => {
    useGameStore.getState().startLevel(initialMaze);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Bypass the Pickup union to simulate a future type not yet handled.
    useGameStore.getState().pickup({ id: crypto.randomUUID(), x: 1, z: 1, type: 'unknown' as never, value: 1 });
    expect(warnSpy).toHaveBeenCalled();
    expect(useGameStore.getState().pickupCount.collected).toBe(0);
    warnSpy.mockRestore();
  });

  it('health pickup adds health and increments collected', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.setState({ health: 1 });
    useGameStore.getState().pickup({ id: crypto.randomUUID(), x: 1, z: 1, type: 'health', value: 1 });
    const s = useGameStore.getState();
    expect(s.health).toBe(2);
    expect(s.pickupCount.collected).toBe(1);
  });

  it('health pickup caps at maxHealth', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.setState({ health: 3 });
    useGameStore.getState().pickup({ id: crypto.randomUUID(), x: 1, z: 1, type: 'health', value: 5 });
    expect(useGameStore.getState().health).toBe(3);
    expect(useGameStore.getState().pickupCount.collected).toBe(1);
  });

  it('damage decrements health and triggers game-over at 0', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().damage(1, 0);
    expect(useGameStore.getState().health).toBe(2);
    // Advance past the 0.5s invulnerable window so the second damage lands.
    useGameStore.getState().damage(2, 0.6);
    expect(useGameStore.getState().screen).toBe('game-over');
  });

  it('damage within the 0.5s invulnerable window does not apply again (P2-4a)', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().damage(1, 0);
    expect(useGameStore.getState().health).toBe(2);
    expect(useGameStore.getState().invulnerableUntil).toBeCloseTo(0.5);
    // Second hit inside the window — should be a no-op.
    useGameStore.getState().damage(1, 0.1);
    expect(useGameStore.getState().health).toBe(2);
    // After the window elapses, a new hit lands.
    useGameStore.getState().damage(1, 0.6);
    expect(useGameStore.getState().health).toBe(1);
  });

  describe('survive mode (P2-4a)', () => {
    it('in survive mode, reaching currentSurviveSeconds transitions to win', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'survive', surviveSeconds: 30 });
      expect(useGameStore.getState().currentMode).toBe('survive');
      expect(useGameStore.getState().currentSurviveSeconds).toBe(30);
      useGameStore.getState().tick(30);
      expect(useGameStore.getState().screen).toBe('win');
      expect(useGameStore.getState().elapsedTime).toBe(30);
    });

    it('in survive mode, timeRemaining is not used and the countdown is gone', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'survive', surviveSeconds: 60 });
      // The maze declares initialTime: 60; survive mode keeps it but doesn't
      // countdown on tick. timeRemaining is irrelevant for win detection.
      useGameStore.getState().tick(30);
      expect(useGameStore.getState().timeRemaining).toBe(60);
      expect(useGameStore.getState().elapsedTime).toBeCloseTo(30);
    });

    it('time pickup extends currentSurviveSeconds in survive mode (F5 regression)', () => {
      // Regression (F5): previously a time pickup only grew
      // `timeRemaining` (HUD-irrelevant in survive mode) so the player
      // saw the pickup "do nothing". Now the same bonus is added to
      // `currentSurviveSeconds`, which is what the HUD counts down from
      // (HUD.tsx:21-23), so the pickup visibly extends the survive budget.
      useGameStore.getState().startLevel(initialMaze, { mode: 'survive', surviveSeconds: 30 });
      expect(useGameStore.getState().currentSurviveSeconds).toBe(30);
      useGameStore.getState().pickup({ id: crypto.randomUUID(), x: 1, z: 1, type: 'time', value: 10 });
      const s = useGameStore.getState();
      expect(s.currentSurviveSeconds).toBe(40); // 30 + 10 (p.value)
      expect(s.pickupCount.collected).toBe(1);
    });
  });

  describe('progressive spawn (P2-4a)', () => {
    // P2-5 FR-20: progressive enemy spawning is only meaningful in survive
    // mode. The non-survive hard-gate in gameStore.startLevel clamps the
    // store-side enemyCount to 0 regardless of options.enemyCount, so the
    // spawn trigger never fires. Existing tests below were written before
    // the gate; they now pass mode: 'survive' so they exercise the
    // intended survive-mode path that the gate preserves.
    it('starts with progressiveEnemyCount from options.enemyCount', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'survive', enemyCount: 7 });
      expect(useGameStore.getState().progressiveEnemyCount).toBe(7);
    });

    it('triggers a time-based spawn after intervalSec seconds', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'survive', enemyCount: 3 });
      expect(useGameStore.getState().progressiveEnemyCount).toBe(3);
      useGameStore.getState().tick(15);
      expect(useGameStore.getState().progressiveEnemyCount).toBe(4);
    });

    it('triggers a pickup-based spawn when a pickup is collected', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'survive', enemyCount: 3 });
      useGameStore.getState().pickup({ id: crypto.randomUUID(), x: 1, z: 1, type: 'time', value: 5 });
      // tick is required for the trigger to commit; pickupCount advances
      // synchronously, but the store's tick is what re-runs the trigger.
      useGameStore.getState().tick(0.01);
      expect(useGameStore.getState().progressiveEnemyCount).toBe(4);
    });

    it('clamps progressiveEnemyCount to ENEMY_COUNT_MAX (10)', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'survive', enemyCount: 10 });
      // Even after multiple time intervals, count stays at 10.
      useGameStore.getState().tick(60);
      expect(useGameStore.getState().progressiveEnemyCount).toBe(10);
    });
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

  // F4: hitCount is the monotonic counter HealthBar/InvulnerableFlash use to
  // re-trigger the flash animation on every contact. startLevel zeros it;
  // goToMenu must also zero it so a previous run's damage history doesn't
  // carry into a fresh session and immediately re-trigger a stale flash.
  it('goToMenu resets hitCount to 0 (F4)', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().damage(1, 0);
    expect(useGameStore.getState().hitCount).toBe(1);
    useGameStore.getState().goToMenu();
    expect(useGameStore.getState().hitCount).toBe(0);
  });

  // F4: hitCount must bump on every damage() call, even when the call is
  // absorbed by the 0.5s invulnerable window. The UI subscribes to this so
  // a second enemy contact in the same window still re-triggers the flash
  // animation, even though health is unchanged.
  it('damage bumps hitCount on every call, including invuln-window no-ops (F4)', () => {
    useGameStore.getState().startLevel(initialMaze);
    expect(useGameStore.getState().hitCount).toBe(0);
    useGameStore.getState().damage(1, 0);
    expect(useGameStore.getState().hitCount).toBe(1);
    // Second hit inside the window — health unchanged, but hitCount still bumps.
    useGameStore.getState().damage(1, 0.1);
    expect(useGameStore.getState().health).toBe(2);
    expect(useGameStore.getState().hitCount).toBe(2);
    // Third hit inside the window — same.
    useGameStore.getState().damage(1, 0.2);
    expect(useGameStore.getState().health).toBe(2);
    expect(useGameStore.getState().hitCount).toBe(3);
  });

  describe('startLevel options + time-trial (P2-3)', () => {
    it('defaults currentMode to maze.rules.victory when no options are passed', () => {
      useGameStore.getState().startLevel(initialMaze);
      expect(useGameStore.getState().currentMode).toBe('reach-exit');
    });

    it('overrides currentMode when options.mode is provided', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'time-trial' });
      expect(useGameStore.getState().currentMode).toBe('time-trial');
    });

    it('in time-trial mode, timeRemaining is forced to 180s regardless of maze.rules.initialTime', () => {
      // initialMaze declares initialTime: 60, but the mode preset overrides it.
      useGameStore.getState().startLevel(initialMaze, { mode: 'time-trial' });
      expect(useGameStore.getState().timeRemaining).toBe(180);
    });

    it('in time-trial mode, tick decrements timeRemaining', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'time-trial' });
      useGameStore.getState().tick(5);
      expect(useGameStore.getState().timeRemaining).toBe(175);
    });

    it('in time-trial mode, tick still increments elapsedTime', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'time-trial' });
      useGameStore.getState().tick(3);
      expect(useGameStore.getState().elapsedTime).toBeCloseTo(3);
    });

    it('in time-trial mode, timeRemaining at 0 triggers game-over (spec FR-8)', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'time-trial' });
      useGameStore.getState().tick(180);
      expect(useGameStore.getState().screen).toBe('game-over');
    });

    it('in time-trial mode, reachExit still transitions to win', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'time-trial' });
      useGameStore.getState().reachExit();
      expect(useGameStore.getState().screen).toBe('win');
    });

    it('in reach-exit mode, timeRemaining uses maze.rules.initialTime (not 180s)', () => {
      // reach-exit does NOT apply the time-trial preset — it respects the
      // maze's own initialTime, which is what hand-crafted levels tune.
      useGameStore.getState().startLevel(initialMaze);
      expect(useGameStore.getState().timeRemaining).toBe(60);
    });

    it('startLevel resets currentMode to whatever the new options dictate', () => {
      useGameStore.getState().startLevel(initialMaze, { mode: 'time-trial' });
      expect(useGameStore.getState().currentMode).toBe('time-trial');
      useGameStore.getState().startLevel(initialMaze);
      expect(useGameStore.getState().currentMode).toBe('reach-exit');
    });
  });

  describe('useItem (P2-2 #9/#10)', () => {
    it('is a no-op when not playing', () => {
      useGameStore.setState({ useItemFlash: null });
      useGameStore.getState().useItem(0);
      expect(useGameStore.getState().useItemFlash).toBeNull();
    });

    // F3: silent ignores are now surfaced via console.debug so a Digit1/
// Digit2 press during pause / game-over / win / menu leaves a trace
// instead of feeling like a broken keyboard to the player.
it('logs a debug message when useItem is called while not playing (F3)', () => {
 const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
 useGameStore.setState({ useItemFlash: null });
 // Default screen after goToMenu is 'menu', which is not 'playing'.
 useGameStore.getState().useItem(0);
 expect(spy).toHaveBeenCalled();
 const call = spy.mock.calls[0];
 expect(call[0]).toBe('[useItem] ignored: screen =');
 expect(call[1]).toBe('menu');
 spy.mockRestore();
});

it('bumps useItemFlash.version when the slot is filled', () => {
      useGameStore.getState().startLevel(initialMaze);
      useGameStore.setState({
        inventory: [{ id: crypto.randomUUID(), x: 0, z: 0, type: 'key', value: 1 }, null],
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
        inventory: [{ id: crypto.randomUUID(), x: 0, z: 0, type: 'key', value: 1 }, null],
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
        inventory: [{ id: crypto.randomUUID(), x: 0, z: 0, type: 'key', value: 1 }, null],
        useItemFlash: { slot: 0, version: 5 },
      });
      useGameStore.getState().startLevel(initialMaze);
      expect(useGameStore.getState().useItemFlash).toBeNull();
    });
  });
});
