import { describe, it, expect } from 'vitest';
import { formatTime } from '../../src/utils/time';

describe('formatTime', () => {
  it('formats whole minutes and seconds as mm:ss', () => {
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(125)).toBe('02:05');
    expect(formatTime(0)).toBe('00:00');
  });
  it('rounds down to nearest second', () => {
    expect(formatTime(59.9)).toBe('00:59');
  });
  it('clamps negative values to 0', () => {
    expect(formatTime(-10)).toBe('00:00');
  });
  it('handles values > 99 minutes without truncation', () => {
    expect(formatTime(60 * 60)).toBe('60:00');
  });
});
