import { create } from 'zustand';
import type { TutorialStep, TutorialTrigger } from '../maze/types';

// P2-11: events emitted by the engine (via GameBridge.onTutorialEvent) to
// drive tutorial step advancement. The store owns the current-step state
// and decides whether an event advances, times out, or is ignored.
export type TutorialEvent =
  | { kind: 'mouse-look'; deltaYaw: number; deltaPitch: number }
  | { kind: 'key-pressed'; key: string }
  | { kind: 'pickup-collected'; total: number }
  | { kind: 'reached-exit' };

// Cumulative mouse yaw+pitch (rad) required before a `mouse-look` trigger
// fires. ~0.3 rad ≈ 17°, enough to detect a deliberate look but small
// enough to fire within a couple of frames on most mice.
const MOUSE_LOOK_THRESHOLD = 0.3;

export interface TutorialStoreState {
  steps: TutorialStep[];
  currentStepId: string | null;
  start(steps: TutorialStep[]): void;
  dispatch(event: TutorialEvent): void;
  reset(): void;
}

export const useTutorialStore = create<TutorialStoreState>((set, get) => {
  let _timeoutRef: ReturnType<typeof setTimeout> | null = null;
  let _accumMouseLook = 0;
  let _pickupCount = 0;

  function clearTimer(): void {
    if (_timeoutRef !== null) {
      clearTimeout(_timeoutRef);
      _timeoutRef = null;
    }
  }

  function currentStep(): TutorialStep | undefined {
    const id = get().currentStepId;
    if (id === null) return undefined;
    return get().steps.find((s) => s.id === id);
  }

  function scheduleTimeout(step: TutorialStep): void {
    clearTimer();
    const t = step.trigger;
    if (t.type !== 'timeout' && t.timeoutSec === undefined) return;
    const sec = t.type === 'timeout' ? t.timeoutSec : t.timeoutSec!;
    _timeoutRef = setTimeout(() => {
      advance();
    }, sec * 1000);
  }

  function advance(): void {
    clearTimer();
    const { steps, currentStepId } = get();
    if (currentStepId === null) return;
    const idx = steps.findIndex((s) => s.id === currentStepId);
    if (idx < 0) {
      set({ currentStepId: null });
      return;
    }
    const next = steps[idx + 1];
    _accumMouseLook = 0;
    if (!next) {
      set({ currentStepId: null });
      return;
    }
    set({ currentStepId: next.id });
    scheduleTimeout(next);
  }

  function eventMatches(event: TutorialEvent, trigger: TutorialTrigger): boolean {
    switch (trigger.type) {
      case 'mouse-look':
        if (event.kind !== 'mouse-look') return false;
        _accumMouseLook += Math.abs(event.deltaYaw) + Math.abs(event.deltaPitch);
        if (_accumMouseLook >= MOUSE_LOOK_THRESHOLD) {
          _accumMouseLook = 0;
          return true;
        }
        return false;
      case 'key-pressed':
        return event.kind === 'key-pressed' && trigger.keys.includes(event.key);
      case 'pickup-collected': {
        if (event.kind !== 'pickup-collected') return false;
        _pickupCount = event.total;
        const target = trigger.count ?? 1;
        return _pickupCount >= target;
      }
      case 'reached-exit':
        return event.kind === 'reached-exit';
      case 'timeout':
        return false;
      default:
        return false;
    }
  }

  return {
    steps: [],
    currentStepId: null,
    start(steps: TutorialStep[]) {
      clearTimer();
      _accumMouseLook = 0;
      _pickupCount = 0;
      if (steps.length === 0) {
        set({ steps: [], currentStepId: null });
        return;
      }
      set({ steps, currentStepId: steps[0].id });
      scheduleTimeout(steps[0]);
    },
    dispatch(event: TutorialEvent) {
      const step = currentStep();
      if (!step) return;
      if (!eventMatches(event, step.trigger)) return;
      advance();
    },
    reset() {
      clearTimer();
      _accumMouseLook = 0;
      _pickupCount = 0;
      set({ steps: [], currentStepId: null });
    },
  };
});