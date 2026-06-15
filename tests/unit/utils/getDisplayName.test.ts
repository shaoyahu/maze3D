/**
 * P2-8: getDisplayName unit tests.
 */
import { describe, it, expect } from 'vitest';
import { getDisplayName } from '../../../src/utils/getDisplayName';
import type { MazeData } from '../../../src/maze/types';

function mk(name: string, i18n?: { en?: string }): Pick<MazeData, 'name' | 'i18n'> {
  return { name, i18n };
}

describe('getDisplayName (P2-8)', () => {
  it('returns the canonical name when locale is zh', () => {
    expect(getDisplayName(mk('空庭', { en: 'Empty Court' }), 'zh')).toBe('空庭');
  });

  it('returns the en override when present', () => {
    expect(getDisplayName(mk('空庭', { en: 'Empty Court' }), 'en')).toBe('Empty Court');
  });

  it('falls back to name when i18n is missing entirely', () => {
    expect(getDisplayName(mk('空庭'), 'en')).toBe('空庭');
  });

  it('falls back to name when i18n.en is undefined or empty', () => {
    expect(getDisplayName(mk('空庭', {}), 'en')).toBe('空庭');
    expect(getDisplayName(mk('空庭', { en: '' }), 'en')).toBe('空庭');
  });

  it('falls back to name for any unknown locale', () => {
    expect(getDisplayName(mk('空庭', { en: 'Empty Court' }), 'xx' as never)).toBe('空庭');
  });
});