import { describe, it, expect } from 'vitest';
import { clampErrorValue, MAX_ERROR_VALUE_CHARS } from '../../../src/utils/errors';

describe('clampErrorValue (F-project-review-2026-06-13-D-30)', () => {
  it('returns short strings unchanged', () => {
    expect(clampErrorValue('enemy-1')).toBe('enemy-1');
  });

  it('returns the empty string unchanged', () => {
    // A 0-length string is below the cap; nothing to clamp.
    expect(clampErrorValue('')).toBe('');
  });

  it('passes a string at exactly MAX_ERROR_VALUE_CHARS through verbatim', () => {
    // Boundary: the threshold is INCLUSIVE — length === cap stays whole,
    // because truncating would lose information for the legitimate-length
    // case (e.g. an editor-chosen id of exactly 80 chars).
    const s = 'x'.repeat(MAX_ERROR_VALUE_CHARS);
    expect(clampErrorValue(s)).toBe(s);
    expect(clampErrorValue(s).length).toBe(MAX_ERROR_VALUE_CHARS);
  });

  it('truncates strings longer than MAX_ERROR_VALUE_CHARS and appends an ellipsis', () => {
    // The truncating behavior must (a) cap the result length and (b) make
    // the truncation visible to the user via a trailing ellipsis. A
    // silent truncation would mislead readers into thinking the rest of
    // the data was somehow valid.
    const s = 'x'.repeat(MAX_ERROR_VALUE_CHARS + 100);
    const out = clampErrorValue(s);
    expect(out.length).toBeLessThanOrEqual(MAX_ERROR_VALUE_CHARS + 1); // +1 for the ellipsis char
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('x'.repeat(MAX_ERROR_VALUE_CHARS))).toBe(true);
  });

  it('stringifies non-string inputs (numbers, booleans) before clamping', () => {
    // Validation surfaces numbers and booleans occasionally (e.g. an
    // enemy `id` written as a number in hand-crafted JSON). The helper
    // must not throw on these — it must coerce.
    expect(clampErrorValue(42)).toBe('42');
    expect(clampErrorValue(false)).toBe('false');
    expect(clampErrorValue(true)).toBe('true');
  });

  it('coerces objects and arrays via String() (debugging aid, not a security boundary)', () => {
    // Object/array inputs stringify to something — this is a fall-through
    // case for malformed JSON; the validator should have caught and
    // rejected these earlier, so the exact form is not pinned. The
    // critical property is "no throw, bounded output".
    const huge = { kind: 'x'.repeat(MAX_ERROR_VALUE_CHARS + 50) };
    const out = clampErrorValue(huge);
    expect(typeof out).toBe('string');
    expect(out.length).toBeLessThanOrEqual(MAX_ERROR_VALUE_CHARS + 1);
  });

  it('handles a huge enemy id without locking up the call site (10 KB scenario)', () => {
    // F-D-30: the original symptom. A 10 KB string is the realistic
    // upper-bound a malicious or buggy editor could produce. The helper
    // MUST bound the output so the LevelSelect error UI doesn't render
    // a paragraph-sized blob into the DOM.
    const huge = 'A'.repeat(10_000);
    const out = clampErrorValue(huge);
    expect(out.length).toBeLessThanOrEqual(MAX_ERROR_VALUE_CHARS + 1);
    expect(out.endsWith('…')).toBe(true);
  });
});