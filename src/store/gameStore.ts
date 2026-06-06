import { create } from 'zustand';
import type { MazeData, Pickup } from '../maze/types';

export type Screen = 'menu' | 'playing' | 'paused' | 'game-over' | 'win';

export interface GameState {
  screen: Screen;
  currentLevelId: string | null;
  currentMaze: MazeData | null;
  timeRemaining: number;
  health: number;
  pickupCount: { collected: number; total: number };
  inventory: (Pickup | null)[];

  startLevel: (maze: MazeData) => void;
  pause: () => void;
  resume: () => void;
  tick: (dt: number) => void;
  pickup: (p: Pickup) => void;
  damage: (n: number) => void;
  reachExit: () => void;
  goToMenu: () => void;
}

const INVENTORY_SIZE = 2;

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'menu',
  currentLevelId: null,
  currentMaze: null,
  timeRemaining: 0,
  health: 0,
  pickupCount: { collected: 0, total: 0 },
  inventory: [null, null],

  startLevel: (maze) =>
    set({
      screen: 'playing',
      currentLevelId: maze.id,
      currentMaze: maze,
      timeRemaining: maze.rules.initialTime,
      health: maze.rules.maxHealth,
      pickupCount: { collected: 0, total: maze.pickups.length },
      inventory: Array(INVENTORY_SIZE).fill(null),
    }),

  pause: () => {
    if (get().screen === 'playing') set({ screen: 'paused' });
  },
  resume: () => {
    if (get().screen === 'paused') set({ screen: 'playing' });
  },

  tick: (dt) => {
    const s = get();
    if (s.screen !== 'playing') return;
    const next = s.timeRemaining - dt;
    if (next <= 0) set({ timeRemaining: 0, screen: 'game-over' });
    else set({ timeRemaining: next });
  },

  pickup: (p) => {
    const s = get();
    if (s.screen !== 'playing') return;
    const inv = [...s.inventory];
    if (p.type === 'time') {
      set({
        timeRemaining: s.timeRemaining + (s.currentMaze?.rules.timeOnPickup ?? p.value),
        pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
      });
    } else {
      const idx = inv.findIndex((slot) => slot === null);
      if (idx >= 0) inv[idx] = p;
      set({
        inventory: inv,
        pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
      });
    }
  },

  damage: (n) => {
    const s = get();
    if (s.screen !== 'playing') return;
    const next = s.health - n;
    if (next <= 0) set({ health: 0, screen: 'game-over' });
    else set({ health: next });
  },

  reachExit: () => {
    if (get().screen === 'playing') set({ screen: 'win' });
  },

  goToMenu: () => set({ screen: 'menu', currentLevelId: null, currentMaze: null }),
}));
