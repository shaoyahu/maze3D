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
  lastWinIsNewRecord: boolean | null;
  // Wall-clock time spent in the current level (pauses excluded). Separate
  // from timeRemaining because time pickups can push it past initialTime,
  // making initialTime - timeRemaining negative.
  elapsedTime: number;
  // Bumped on every startLevel() call so React effects (e.g. GameCanvas's
  // level-reset effect) can observe "retry happened" even when the new
  // maze id matches the old one. Without this, a retry on the same level
  // would be invisible to effects keyed on maze.id.
  restartKey: number;
  // P2-2 #9: transient flash trigger for InventoryBar. Bumped on every
  // valid useItem so the UI can use it as a React key to re-trigger the
  // one-shot CSS flash animation. Null when no flash is pending.
  useItemFlash: { slot: 0 | 1; version: number } | null;

  startLevel: (maze: MazeData) => void;
  pause: () => void;
  resume: () => void;
  tick: (dt: number) => void;
  pickup: (p: Pickup) => boolean;
  damage: (n: number) => void;
  useItem: (slot: 0 | 1) => void;
  reachExit: (isNewRecord?: boolean) => void;
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
  lastWinIsNewRecord: null,
  elapsedTime: 0,
  restartKey: 0,
  useItemFlash: null,

  startLevel: (maze) =>
    set((s) => ({
      screen: 'playing',
      currentLevelId: maze.id,
      currentMaze: maze,
      timeRemaining: maze.rules.initialTime,
      health: maze.rules.maxHealth,
      pickupCount: { collected: 0, total: maze.pickups.length },
      inventory: Array(INVENTORY_SIZE).fill(null),
      lastWinIsNewRecord: null,
      elapsedTime: 0,
      restartKey: s.restartKey + 1,
      useItemFlash: null,
    })),

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
    if (next <= 0) {
      // Player was only alive for s.timeRemaining seconds of this frame —
      // the (dt - s.timeRemaining) tail is wall-clock time after they were
      // already dead, so don't count it.
      set({ timeRemaining: 0, screen: 'game-over', elapsedTime: s.elapsedTime + s.timeRemaining });
    } else {
      set({ timeRemaining: next, elapsedTime: s.elapsedTime + dt });
    }
  },

  pickup: (p): boolean => {
    const s = get();
    if (s.screen !== 'playing') return false;
    if (p.type === 'time') {
      set({
        timeRemaining: s.timeRemaining + (s.currentMaze?.rules.timeOnPickup ?? p.value),
        pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
      });
      return true;
    }
    if (p.type === 'health') {
      const maxHealth = s.currentMaze?.rules.maxHealth ?? p.value;
      const newHealth = Math.min(maxHealth, s.health + p.value);
      set({
        health: newHealth,
        pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
      });
      return true;
    }
    if (p.type === 'key') {
      const inv = [...s.inventory];
      const idx = inv.findIndex((slot) => slot === null);
      if (idx >= 0) {
        inv[idx] = p;
        set({
          inventory: inv,
          pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
        });
        return true;
      }
      // Inventory full — the engine must keep the pickup in the world.
      return false;
    }
    console.warn(`gameStore.pickup: unknown pickup type '${p.type}', dropping`, p);
    return false;
  },

  damage: (n) => {
    const s = get();
    if (s.screen !== 'playing') return;
    const next = s.health - n;
    if (next <= 0) set({ health: 0, screen: 'game-over' });
    else set({ health: next });
  },

  useItem: (slot) => {
    const s = get();
    if (s.screen !== 'playing') return;
    if (slot < 0 || slot >= INVENTORY_SIZE) return;
    if (!s.inventory[slot]) return; // empty slot: no-op per spec §5.2
    set({
      useItemFlash: { slot, version: (s.useItemFlash?.version ?? 0) + 1 },
    });
  },

  reachExit: (isNewRecord) => {
    if (get().screen === 'playing') set({ screen: 'win', lastWinIsNewRecord: isNewRecord ?? null });
  },

  goToMenu: () =>
    set({
      screen: 'menu',
      currentLevelId: null,
      currentMaze: null,
      timeRemaining: 0,
      health: 0,
      pickupCount: { collected: 0, total: 0 },
      inventory: [null, null],
      lastWinIsNewRecord: null,
      elapsedTime: 0,
      restartKey: 0,
      useItemFlash: null,
    }),
}));
