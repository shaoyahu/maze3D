import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTutorialStore } from '../../../src/store/tutorialStore';
import type { TutorialStep } from '../../../src/maze/types';

const STEP_MOUSE: TutorialStep = {
  id: 'mouse',
  messageKey: 'k.mouse',
  trigger: { type: 'mouse-look' },
};
const STEP_KEY: TutorialStep = {
  id: 'key',
  messageKey: 'k.key',
  trigger: { type: 'key-pressed', keys: ['w', 'a'] },
};
const STEP_PICKUP: TutorialStep = {
  id: 'pickup',
  messageKey: 'k.pickup',
  trigger: { type: 'pickup-collected', count: 2 },
};
const STEP_EXIT: TutorialStep = {
  id: 'exit',
  messageKey: 'k.exit',
  trigger: { type: 'reached-exit' },
};
const STEP_TIMEOUT: TutorialStep = {
  id: 'timeout',
  messageKey: 'k.timeout',
  trigger: { type: 'timeout', timeoutSec: 1 },
};

beforeEach(() => {
  vi.useFakeTimers();
  useTutorialStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tutorialStore.start', () => {
  it('starts at step 0', () => {
    useTutorialStore.getState().start([STEP_MOUSE, STEP_KEY]);
    expect(useTutorialStore.getState().currentStepId).toBe('mouse');
  });

  it('clears state when given an empty list', () => {
    useTutorialStore.getState().start([STEP_MOUSE]);
    useTutorialStore.getState().start([]);
    expect(useTutorialStore.getState().currentStepId).toBeNull();
    expect(useTutorialStore.getState().steps).toEqual([]);
  });

  it('resets an in-progress tutorial when start is called again', () => {
    useTutorialStore.getState().start([STEP_MOUSE, STEP_KEY]);
    useTutorialStore.getState().start([STEP_EXIT]);
    expect(useTutorialStore.getState().currentStepId).toBe('exit');
    expect(useTutorialStore.getState().steps).toEqual([STEP_EXIT]);
  });
});

describe('tutorialStore.dispatch — mouse-look trigger', () => {
  it('fires after cumulative rotation crosses ~0.3 rad', () => {
    useTutorialStore.getState().start([STEP_MOUSE, STEP_EXIT]);
    useTutorialStore.getState().dispatch({ kind: 'mouse-look', deltaYaw: 0.1, deltaPitch: 0 });
    expect(useTutorialStore.getState().currentStepId).toBe('mouse');
    useTutorialStore.getState().dispatch({ kind: 'mouse-look', deltaYaw: 0.1, deltaPitch: 0 });
    expect(useTutorialStore.getState().currentStepId).toBe('mouse');
    useTutorialStore.getState().dispatch({ kind: 'mouse-look', deltaYaw: 0.15, deltaPitch: 0 });
    expect(useTutorialStore.getState().currentStepId).toBe('exit');
  });

  it('counts absolute delta — direction does not matter', () => {
    useTutorialStore.getState().start([STEP_MOUSE, STEP_EXIT]);
    useTutorialStore.getState().dispatch({ kind: 'mouse-look', deltaYaw: -0.2, deltaPitch: -0.2 });
    expect(useTutorialStore.getState().currentStepId).toBe('exit');
  });
});

describe('tutorialStore.dispatch — key-pressed trigger', () => {
  it('matches any key in the keys list', () => {
    useTutorialStore.getState().start([STEP_KEY, STEP_EXIT]);
    useTutorialStore.getState().dispatch({ kind: 'key-pressed', key: 'w' });
    expect(useTutorialStore.getState().currentStepId).toBe('exit');
  });

  it('ignores keys not in the list', () => {
    useTutorialStore.getState().start([STEP_KEY, STEP_EXIT]);
    useTutorialStore.getState().dispatch({ kind: 'key-pressed', key: 'q' });
    expect(useTutorialStore.getState().currentStepId).toBe('key');
  });
});

describe('tutorialStore.dispatch — pickup-collected trigger', () => {
  it('advances when total reaches count (default 1)', () => {
    useTutorialStore.getState().start([STEP_PICKUP, STEP_EXIT]);
    useTutorialStore.getState().dispatch({ kind: 'pickup-collected', total: 1 });
    expect(useTutorialStore.getState().currentStepId).toBe('pickup');
    useTutorialStore.getState().dispatch({ kind: 'pickup-collected', total: 2 });
    expect(useTutorialStore.getState().currentStepId).toBe('exit');
  });

  it('uses count=1 when not specified', () => {
    const step: TutorialStep = {
      id: 'p',
      messageKey: 'k.p',
      trigger: { type: 'pickup-collected' },
    };
    useTutorialStore.getState().start([step, STEP_EXIT]);
    useTutorialStore.getState().dispatch({ kind: 'pickup-collected', total: 1 });
    expect(useTutorialStore.getState().currentStepId).toBe('exit');
  });
});

describe('tutorialStore.dispatch — reached-exit trigger', () => {
  it('advances when reached-exit fires', () => {
    useTutorialStore.getState().start([STEP_EXIT]);
    useTutorialStore.getState().dispatch({ kind: 'reached-exit' });
    expect(useTutorialStore.getState().currentStepId).toBeNull();
  });
});

describe('tutorialStore.dispatch — non-matching events are ignored', () => {
  it('does not advance on wrong event kind', () => {
    useTutorialStore.getState().start([STEP_KEY, STEP_EXIT]);
    useTutorialStore.getState().dispatch({ kind: 'reached-exit' });
    expect(useTutorialStore.getState().currentStepId).toBe('key');
  });

  it('does nothing when no current step', () => {
    useTutorialStore.getState().dispatch({ kind: 'reached-exit' });
    expect(useTutorialStore.getState().currentStepId).toBeNull();
  });
});

describe('tutorialStore — timeout fallback', () => {
  it('advances after timeoutSec when no event matches', () => {
    useTutorialStore.getState().start([STEP_TIMEOUT, STEP_EXIT]);
    expect(useTutorialStore.getState().currentStepId).toBe('timeout');
    vi.advanceTimersByTime(1000);
    expect(useTutorialStore.getState().currentStepId).toBe('exit');
  });

  it('clears the previous timer when advancing manually', () => {
    useTutorialStore.getState().start([STEP_KEY, STEP_TIMEOUT, STEP_EXIT]);
    vi.advanceTimersByTime(500);
    useTutorialStore.getState().dispatch({ kind: 'key-pressed', key: 'w' });
    expect(useTutorialStore.getState().currentStepId).toBe('timeout');
    vi.advanceTimersByTime(2000);
    expect(useTutorialStore.getState().currentStepId).toBe('exit');
  });
});

describe('tutorialStore.reset', () => {
  it('clears state and cancels pending timer', () => {
    useTutorialStore.getState().start([STEP_TIMEOUT, STEP_EXIT]);
    useTutorialStore.getState().reset();
    expect(useTutorialStore.getState().currentStepId).toBeNull();
    expect(useTutorialStore.getState().steps).toEqual([]);
    vi.advanceTimersByTime(5000);
    expect(useTutorialStore.getState().currentStepId).toBeNull();
  });
});