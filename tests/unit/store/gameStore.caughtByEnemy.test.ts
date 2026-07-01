import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../../src/store/gameStore';
import type { MazeData } from '../../../src/maze/types';

const mazeCaught: MazeData = {
  id: 'caught',
  name: '哨兵回廊',
  size: { width: 7, depth: 7 },
  cellSize: 2,
  start: { x: 0, z: 0 },
  exit: { x: 6, z: 6 },
  walls: [],
  pickups: [],
  rules: {
    initialTime: 60,
    maxHealth: 3,
    victory: 'caught-by-enemy',
    timeOnPickup: 0,
  },
  enemies: [],
  traps: [],
  doors: [],
};

const mazeReach: MazeData = {
  ...mazeCaught,
  id: 'reach',
  name: '基础教学',
  rules: { ...mazeCaught.rules, victory: 'reach-exit' },
};

beforeEach(() => {
  useGameStore.setState({
    screen: 'menu',
    currentMaze: null,
    health: 0,
    lastHitBy: 'other',
    lastWinKind: null,
  });
});

describe('gameStore.damage — caught-by-enemy routing (P2-11)', () => {
  it('routes to WinOverlay when enemy kills player in caught-by-enemy level', () => {
    useGameStore.getState().startLevel(mazeCaught);
    useGameStore.getState().damage(3, 1, 'enemy');
    const s = useGameStore.getState();
    expect(s.health).toBe(0);
    expect(s.screen).toBe('win');
    expect(s.lastWinKind).toBe('caught-by-enemy');
    expect(s.lastHitBy).toBe('enemy');
  });

  it('routes to GameOver when enemy kills player in reach-exit level', () => {
    useGameStore.getState().startLevel(mazeReach);
    useGameStore.getState().damage(3, 1, 'enemy');
    const s = useGameStore.getState();
    expect(s.health).toBe(0);
    expect(s.screen).toBe('game-over');
    expect(s.lastWinKind).toBeNull();
    expect(s.lastHitBy).toBe('enemy');
  });

  it('routes to GameOver when non-enemy damage kills player in caught-by-enemy level', () => {
    useGameStore.getState().startLevel(mazeCaught);
    useGameStore.getState().damage(3, 1, 'other');
    const s = useGameStore.getState();
    expect(s.health).toBe(0);
    expect(s.screen).toBe('game-over');
    expect(s.lastWinKind).toBeNull();
  });

  it('does not flip screen when player survives with positive health', () => {
    useGameStore.getState().startLevel(mazeCaught);
    useGameStore.getState().damage(1, 1, 'enemy');
    const s = useGameStore.getState();
    expect(s.health).toBe(2);
    expect(s.screen).toBe('playing');
    expect(s.lastHitBy).toBe('enemy');
    expect(s.lastWinKind).toBeNull();
  });

  it('tracks lastHitBy even on non-lethal hits for downstream diagnostics', () => {
    useGameStore.getState().startLevel(mazeReach);
    useGameStore.getState().damage(1, 1, 'enemy');
    expect(useGameStore.getState().lastHitBy).toBe('enemy');
    useGameStore.getState().damage(1, 2, 'other');
    expect(useGameStore.getState().lastHitBy).toBe('other');
  });

  it('defaults source to "other" so legacy 2-arg callers keep existing behavior', () => {
    useGameStore.getState().startLevel(mazeReach);
    useGameStore.getState().damage(3, 1);
    const s = useGameStore.getState();
    expect(s.screen).toBe('game-over');
    expect(s.lastHitBy).toBe('other');
  });
});

describe('gameStore.startLevel — reset lastHitBy + lastWinKind (P2-11)', () => {
  it('resets lastHitBy to other on a fresh level', () => {
    useGameStore.setState({ lastHitBy: 'enemy', lastWinKind: 'caught-by-enemy' });
    useGameStore.getState().startLevel(mazeReach);
    expect(useGameStore.getState().lastHitBy).toBe('other');
    expect(useGameStore.getState().lastWinKind).toBeNull();
  });
});

describe('gameStore.reachExit — sets lastWinKind (P2-11)', () => {
  it('tags reach-exit wins so WinOverlay can distinguish from caught-by-enemy', () => {
    useGameStore.getState().startLevel(mazeReach);
    useGameStore.getState().reachExit(false);
    const s = useGameStore.getState();
    expect(s.screen).toBe('win');
    expect(s.lastWinKind).toBe('reach-exit');
  });
});