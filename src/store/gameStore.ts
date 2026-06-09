import { create } from 'zustand';
import {
  INVENTORY_SIZE,
  type InventorySlot,
  type MazeData,
  type Pickup,
  type StartLevelOptions,
  type VictoryType,
} from '../maze/types';
import { onUseItem } from '../game/Rules';

// P2-3 spec §5/FR-8: time-trial mode forces a 180s budget regardless of
// the maze's own initialTime. reach-exit (and any future mode that doesn't
// override) keeps whatever the maze declares so per-level tuning still works.
const TIME_TRIAL_INITIAL_TIME = 180;

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
  useItemFlash: { slot: InventorySlot; version: number } | null;
  // P2-3: the active victory mode for the current level. Defaults to
  // maze.rules.victory; can be overridden by StartLevelOptions.mode. Both
  // current modes use the same countdown→game-over tick path; the only
  // difference is that time-trial forces a 180s budget (see startLevel
  // below) so the player has a hard time limit, while reach-exit honours
  // whatever initialTime the maze declares.
  currentMode: VictoryType;

  startLevel: (maze: MazeData, options?: StartLevelOptions) => void;
  pause: () => void;
  resume: () => void;
  tick: (dt: number) => void;
  pickup: (p: Pickup) => boolean;
  damage: (n: number) => void;
  useItem: (slot: InventorySlot) => void;
  reachExit: (isNewRecord?: boolean) => void;
  goToMenu: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'menu',
  currentLevelId: null,
  currentMaze: null,
  timeRemaining: 0,
  health: 0,
  pickupCount: { collected: 0, total: 0 },
  inventory: Array(INVENTORY_SIZE).fill(null),
  lastWinIsNewRecord: null,
  elapsedTime: 0,
  restartKey: 0,
  useItemFlash: null,
  currentMode: 'reach-exit',

  startLevel: (maze, options) =>
    set((s) => ({
      screen: 'playing',
      currentLevelId: maze.id,
      currentMaze: maze,
      timeRemaining:
        options?.mode === 'time-trial' ? TIME_TRIAL_INITIAL_TIME : maze.rules.initialTime,
      health: maze.rules.maxHealth,
      pickupCount: { collected: 0, total: maze.pickups.length },
      inventory: Array(INVENTORY_SIZE).fill(null),
      lastWinIsNewRecord: null,
      elapsedTime: 0,
      restartKey: s.restartKey + 1,
      useItemFlash: null,
      currentMode: options?.mode ?? maze.rules.victory,
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
    // Both reach-exit and time-trial share the same countdown→game-over
    // path; the mode only differs in the initial timeRemaining that
    // startLevel seeded (see TIME_TRIAL_INITIAL_TIME).
    const newElapsed = s.elapsedTime + dt;
    const next = s.timeRemaining - dt;
    if (next <= 0) {
      // Player was only alive for s.timeRemaining seconds of this frame —
      // the (dt - s.timeRemaining) tail is wall-clock time after they were
      // already dead, so don't count it.
      set({ timeRemaining: 0, screen: 'game-over', elapsedTime: s.elapsedTime + s.timeRemaining });
    } else {
      set({ timeRemaining: next, elapsedTime: newElapsed });
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
    if (s.screen !== 'playing') {
    // F3: surface the silent ignore so a Digit1/Digit2 press during
    // pause / game-over / win / menu is visible in the console.
    console.debug('[useItem] ignored: screen =', s.screen);
      return;
  }
    const result = onUseItem(slot, s.inventory, s.currentMaze);
    if (!result.flash) return;
    // TODO(P2-4a): when result.consumed flips to true, clear inventory[slot]
    // so the key can't be reused. Rules.onUseItem currently never sets
    // consumed (no lock cells exist yet), but the contract is in place.
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
      inventory: Array(INVENTORY_SIZE).fill(null),
      lastWinIsNewRecord: null,
      elapsedTime: 0,
      restartKey: 0,
      useItemFlash: null,
    }),
}));
