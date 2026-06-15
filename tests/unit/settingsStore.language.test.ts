/**
 * P2-8: settingsStore.language field tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettingsStore, sanitizeSettings } from '../../src/store/settingsStore';

describe('settingsStore.language (P2-8)', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      pointerSensitivity: 0.002,
      fov: 60,
      darkMode: false,
      enemyAggression: 'medium',
      language: 'zh',
    });
  });

  it('defaults to "zh"', () => {
    expect(useSettingsStore.getState().language).toBe('zh');
  });

  it('accepts "en"', () => {
    useSettingsStore.getState().set('language', 'en');
    expect(useSettingsStore.getState().language).toBe('en');
  });

  it('accepts "zh"', () => {
    useSettingsStore.getState().set('language', 'zh');
    expect(useSettingsStore.getState().language).toBe('zh');
  });

  it('rejects an unknown value and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    useSettingsStore.getState().set('language', 'xx' as never);
    expect(useSettingsStore.getState().language).toBe('zh');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sanitizeSettings falls back to "zh" for a pre-P2-8 record', () => {
    const raw = {
      pointerSensitivity: 0.003,
      fov: 70,
      darkMode: true,
      enemyAggression: 'hard',
    };
    const result = sanitizeSettings(raw);
    expect(result).not.toBeNull();
    expect(result!.language).toBe('zh');
  });

  it('sanitizeSettings accepts "en" from a P2-8+ record', () => {
    const raw = {
      pointerSensitivity: 0.003,
      fov: 70,
      darkMode: true,
      enemyAggression: 'hard',
      language: 'en',
    };
    const result = sanitizeSettings(raw);
    expect(result!.language).toBe('en');
  });
});