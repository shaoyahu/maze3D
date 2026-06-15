/**
 * P2-8: getT + useT unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { getT, useT } from '../../../src/i18n';
import { useSettingsStore } from '../../../src/store/settingsStore';

describe('getT (pure function)', () => {
  it('returns the zh string for a known key', () => {
    expect(getT('zh')('settings.title')).toBe('设置');
  });

  it('returns the en string for a known key', () => {
    expect(getT('en')('settings.title')).toBe('Settings');
  });

  it('interpolates a {name} placeholder in zh', () => {
    expect(getT('zh')('hud.enemyCount', { current: 3, max: 10 })).toBe('敌人 3 / 10');
  });

  it('interpolates a {name} placeholder in en', () => {
    expect(getT('en')('hud.enemyCount', { current: 3, max: 10 })).toBe('Enemies 3 / 10');
  });

  it('returns the key and warns when missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getT('zh')('totally.missing.key')).toBe('totally.missing.key');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to zh for an unknown locale and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getT('xx' as never)('settings.title')).toBe('设置');
    warn.mockRestore();
  });

  it('leaves {undefinedVar} unreplaced and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Pass empty vars object so interpolation runs; missing keys trigger warn.
    expect(getT('en')('hud.enemyCount', {})).toBe('Enemies {current} / {max}');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('useT (React hook)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh' });
  });

  it('uses the current settingsStore.language (default zh)', () => {
    const { result } = renderHook(() => useT());
    expect(result.current('settings.title')).toBe('设置');
  });

  it('re-renders and reflects a language switch', () => {
    const { result } = renderHook(() => useT());
    expect(result.current('settings.title')).toBe('设置');
    act(() => {
      useSettingsStore.getState().set('language', 'en');
    });
    expect(result.current('settings.title')).toBe('Settings');
  });
});