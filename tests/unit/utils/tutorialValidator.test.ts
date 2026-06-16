import { describe, it, expect } from 'vitest';
import { validateTutorialSteps } from '../../../src/utils/tutorialValidator';

describe('validateTutorialSteps', () => {
  it('accepts a minimal valid steps array', () => {
    const result = validateTutorialSteps([
      { id: 's1', messageKey: 'tutorial.x.step1', trigger: { type: 'mouse-look' } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]).toEqual({
        id: 's1',
        messageKey: 'tutorial.x.step1',
        trigger: { type: 'mouse-look' },
      });
    }
  });

  it('accepts all 5 trigger types', () => {
    const result = validateTutorialSteps([
      { id: 'a', messageKey: 'k.a', trigger: { type: 'mouse-look' } },
      { id: 'b', messageKey: 'k.b', trigger: { type: 'key-pressed', keys: ['w', 'a'] } },
      { id: 'c', messageKey: 'k.c', trigger: { type: 'pickup-collected', count: 2 } },
      { id: 'd', messageKey: 'k.d', trigger: { type: 'reached-exit' } },
      { id: 'e', messageKey: 'k.e', trigger: { type: 'timeout', timeoutSec: 3 } },
    ]);
    expect(result.ok).toBe(true);
  });

  it('accepts optional timeoutSec on every non-timeout trigger', () => {
    const result = validateTutorialSteps([
      { id: 'a', messageKey: 'k.a', trigger: { type: 'mouse-look', timeoutSec: 5 } },
      { id: 'b', messageKey: 'k.b', trigger: { type: 'key-pressed', keys: ['w'], timeoutSec: 5 } },
      { id: 'c', messageKey: 'k.c', trigger: { type: 'pickup-collected', timeoutSec: 5 } },
      { id: 'd', messageKey: 'k.d', trigger: { type: 'reached-exit', timeoutSec: 5 } },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects non-array input', () => {
    expect(validateTutorialSteps(null).ok).toBe(false);
    expect(validateTutorialSteps(undefined).ok).toBe(false);
    expect(validateTutorialSteps({}).ok).toBe(false);
    expect(validateTutorialSteps('hi').ok).toBe(false);
    expect(validateTutorialSteps(42).ok).toBe(false);
  });

  it('rejects step missing id', () => {
    const r = validateTutorialSteps([{ messageKey: 'k', trigger: { type: 'mouse-look' } }]);
    expect(r.ok).toBe(false);
  });

  it('rejects step with empty id', () => {
    const r = validateTutorialSteps([{ id: '', messageKey: 'k', trigger: { type: 'mouse-look' } }]);
    expect(r.ok).toBe(false);
  });

  it('rejects duplicated ids', () => {
    const r = validateTutorialSteps([
      { id: 's', messageKey: 'k.1', trigger: { type: 'mouse-look' } },
      { id: 's', messageKey: 'k.2', trigger: { type: 'reached-exit' } },
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects step missing messageKey', () => {
    const r = validateTutorialSteps([{ id: 's', trigger: { type: 'mouse-look' } }]);
    expect(r.ok).toBe(false);
  });

  it('rejects step missing trigger', () => {
    const r = validateTutorialSteps([{ id: 's', messageKey: 'k' }]);
    expect(r.ok).toBe(false);
  });

  it('rejects unknown trigger.type', () => {
    const r = validateTutorialSteps([
      { id: 's', messageKey: 'k', trigger: { type: 'who-knows' } },
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects key-pressed without keys', () => {
    const r = validateTutorialSteps([
      { id: 's', messageKey: 'k', trigger: { type: 'key-pressed' } },
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects key-pressed with empty keys array', () => {
    const r = validateTutorialSteps([
      { id: 's', messageKey: 'k', trigger: { type: 'key-pressed', keys: [] } },
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects key-pressed with non-string key', () => {
    const r = validateTutorialSteps([
      { id: 's', messageKey: 'k', trigger: { type: 'key-pressed', keys: ['w', 5] } },
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects timeout trigger without timeoutSec', () => {
    const r = validateTutorialSteps([
      { id: 's', messageKey: 'k', trigger: { type: 'timeout' } },
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects pickup-collected with non-positive count', () => {
    expect(
      validateTutorialSteps([
        { id: 's', messageKey: 'k', trigger: { type: 'pickup-collected', count: 0 } },
      ]).ok,
    ).toBe(false);
    expect(
      validateTutorialSteps([
        { id: 's', messageKey: 'k', trigger: { type: 'pickup-collected', count: -1 } },
      ]).ok,
    ).toBe(false);
  });

  it('rejects non-finite timeoutSec', () => {
    expect(
      validateTutorialSteps([
        { id: 's', messageKey: 'k', trigger: { type: 'timeout', timeoutSec: Number.POSITIVE_INFINITY } },
      ]).ok,
    ).toBe(false);
    expect(
      validateTutorialSteps([
        { id: 's', messageKey: 'k', trigger: { type: 'timeout', timeoutSec: '5' } },
      ]).ok,
    ).toBe(false);
  });

  it('returns error with the offending index', () => {
    const r = validateTutorialSteps([
      { id: 'a', messageKey: 'k', trigger: { type: 'mouse-look' } },
      { id: 'b', messageKey: 'k', trigger: { type: 'garbage' } },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/steps\[1\]/);
  });
});