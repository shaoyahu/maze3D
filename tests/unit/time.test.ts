import { describe, it, expect } from 'vitest';
import { formatTime, clampTime } from '../../src/utils/time';

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

describe('clampTime', () => {
  it('clamps below 0', () => {
    expect(clampTime(-5, 60)).toBe(0);
  });
  it('clamps above max', () => {
    expect(clampTime(120, 60)).toBe(60);
  });
  it('passes through valid values', () => {
    expect(clampTime(30, 60)).toBe(30);
  });
});
