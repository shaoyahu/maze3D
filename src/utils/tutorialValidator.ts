import type { TutorialStep, TutorialTrigger } from '../maze/types';

export type TutorialValidationResult =
  | { ok: true; steps: TutorialStep[] }
  | { ok: false; error: string };

const TRIGGER_TYPES = new Set<TutorialTrigger['type']>([
  'mouse-look',
  'key-pressed',
  'pickup-collected',
  'reached-exit',
  'timeout',
]);

function fail(error: string): TutorialValidationResult {
  return { ok: false, error };
}

function validateTrigger(trigger: unknown, index: number): TutorialTrigger | string {
  if (!trigger || typeof trigger !== 'object') {
    return `steps[${index}].trigger must be an object`;
  }
  const t = trigger as Record<string, unknown>;
  const { type } = t;
  if (typeof type !== 'string' || !TRIGGER_TYPES.has(type as TutorialTrigger['type'])) {
    return `steps[${index}].trigger.type must be one of ${[...TRIGGER_TYPES].join(' | ')}, got ${JSON.stringify(type)}`;
  }
  switch (type) {
    case 'mouse-look':
    case 'reached-exit':
      if (t.timeoutSec !== undefined && (typeof t.timeoutSec !== 'number' || !Number.isFinite(t.timeoutSec))) {
        return `steps[${index}].trigger.timeoutSec must be a finite number when present`;
      }
      return { type } as TutorialTrigger;
    case 'key-pressed': {
      if (!Array.isArray(t.keys) || t.keys.length === 0 || !t.keys.every((k) => typeof k === 'string')) {
        return `steps[${index}].trigger.keys must be a non-empty array of strings`;
      }
      if (t.timeoutSec !== undefined && (typeof t.timeoutSec !== 'number' || !Number.isFinite(t.timeoutSec))) {
        return `steps[${index}].trigger.timeoutSec must be a finite number when present`;
      }
      return { type: 'key-pressed', keys: t.keys as string[] } as TutorialTrigger;
    }
    case 'pickup-collected':
      if (t.count !== undefined && (typeof t.count !== 'number' || !Number.isFinite(t.count) || t.count < 1)) {
        return `steps[${index}].trigger.count must be a positive integer when present`;
      }
      if (t.timeoutSec !== undefined && (typeof t.timeoutSec !== 'number' || !Number.isFinite(t.timeoutSec))) {
        return `steps[${index}].trigger.timeoutSec must be a finite number when present`;
      }
      return { type: 'pickup-collected' } as TutorialTrigger;
    case 'timeout':
      if (typeof t.timeoutSec !== 'number' || !Number.isFinite(t.timeoutSec)) {
        return `steps[${index}].trigger.timeoutSec is required for timeout triggers`;
      }
      return { type: 'timeout', timeoutSec: t.timeoutSec } as TutorialTrigger;
    default:
      return `steps[${index}].trigger.type is unknown: ${String(type)}`;
  }
}

/**
 * P2-11: pure validator for `MazeData.tutorialSteps` payloads.
 *
 * Used both by the editor (JSON textarea → live preview) and by the
 * engine (`Game.startLevel` defensively drops malformed input). Returns
 * a discriminated union — callers must check `.ok` before reading
 * `.steps`. The function never throws.
 */
export function validateTutorialSteps(input: unknown): TutorialValidationResult {
  if (!Array.isArray(input)) {
    return fail('tutorialSteps must be an array');
  }
  const steps: TutorialStep[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i];
    if (!raw || typeof raw !== 'object') {
      return fail(`steps[${i}] must be an object`);
    }
    const step = raw as Record<string, unknown>;
    if (typeof step.id !== 'string' || step.id.length === 0) {
      return fail(`steps[${i}].id must be a non-empty string`);
    }
    if (seenIds.has(step.id)) {
      return fail(`steps[${i}].id "${step.id}" is duplicated`);
    }
    seenIds.add(step.id);
    if (typeof step.messageKey !== 'string' || step.messageKey.length === 0) {
      return fail(`steps[${i}].messageKey must be a non-empty string`);
    }
    const triggerResult = validateTrigger(step.trigger, i);
    if (typeof triggerResult === 'string') {
      return fail(triggerResult);
    }
    steps.push({ id: step.id, messageKey: step.messageKey, trigger: triggerResult });
  }
  return { ok: true, steps };
}