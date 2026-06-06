import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJSON, saveJSON, isStorageAvailable } from '../../src/store/persist';

describe('persist', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isStorageAvailable returns true in happy-dom', () => {
    expect(isStorageAvailable()).toBe(true);
  });

  it('saveJSON then loadJSON round-trips an object', () => {
    saveJSON('k', { a: 1, b: 'x' });
    expect(loadJSON('k')).toEqual({ a: 1, b: 'x' });
  });

  it('loadJSON returns fallback when key missing', () => {
    expect(loadJSON('nope', { a: 0 })).toEqual({ a: 0 });
  });

  it('loadJSON returns fallback on parse error', () => {
    localStorage.setItem('bad', '{not json');
    expect(loadJSON('bad', { fallback: true })).toEqual({ fallback: true });
  });

  it('saveJSON silently no-ops when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveJSON('k', { a: 1 })).not.toThrow();
    spy.mockRestore();
  });
});
