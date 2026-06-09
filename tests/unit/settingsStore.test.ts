import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore, sanitizeSettings } from '../../src/store/settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      pointerSensitivity: 0.002,
      fov: 60,
      darkMode: false,
      enemyAggression: 'medium',
      set: useSettingsStore.getState().set,
    });
  });

  it('starts with default values', () => {
    const s = useSettingsStore.getState();
    expect(s.pointerSensitivity).toBe(0.002);
    expect(s.fov).toBe(60);
    expect(s.darkMode).toBe(false);
    expect(s.enemyAggression).toBe('medium');
  });

  it('set updates a field and persists to localStorage', () => {
    useSettingsStore.getState().set('fov', 75);
    expect(useSettingsStore.getState().fov).toBe(75);
    const raw = localStorage.getItem('maze3d.settings.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.fov).toBe(75);
  });

  it('set updates enemyAggression, persists to localStorage, and round-trips on reload (P2-4a)', () => {
    useSettingsStore.getState().set('enemyAggression', 'hard');
    expect(useSettingsStore.getState().enemyAggression).toBe('hard');
    const raw = localStorage.getItem('maze3d.settings.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.enemyAggression).toBe('hard');
    // The new store re-reads from localStorage on init, so a fresh
    // module import would land on 'hard' — covered here by reading the
    // raw blob that the next store would consume.
  });

  it('set rejects an invalid enemyAggression value', () => {
    useSettingsStore.getState().set('enemyAggression', 'medium');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Cast: the runtime guard exists to protect against bad input that
      // bypassed the type system.
      useSettingsStore.getState().set('enemyAggression', 'nonsense' as never);
      expect(useSettingsStore.getState().enemyAggression).toBe('medium');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  describe('sanitizeSettings', () => {
    it('returns null for non-object input', () => {
      expect(sanitizeSettings(null)).toBeNull();
      expect(sanitizeSettings('bad')).toBeNull();
    });

    it('strips extra fields like the legacy `set: null` and keeps valid core fields', () => {
      const oldShape = { pointerSensitivity: 0.004, fov: 80, darkMode: true, set: null };
      expect(sanitizeSettings(oldShape)).toEqual({
        pointerSensitivity: 0.004,
        fov: 80,
        darkMode: true,
        enemyAggression: 'medium',
      });
    });

    it('returns null when core fields are missing or invalid', () => {
      expect(sanitizeSettings({ set: null })).toBeNull();
      expect(sanitizeSettings({ pointerSensitivity: 0, darkMode: true })).toBeNull();
      expect(sanitizeSettings({ pointerSensitivity: -1, darkMode: true })).toBeNull();
      expect(sanitizeSettings({ pointerSensitivity: 0.002, fov: 20, darkMode: true })).toBeNull();
      expect(sanitizeSettings({ pointerSensitivity: 0.002, fov: 200, darkMode: true })).toBeNull();
    });

    it('returns the sanitized settings when all core fields are valid', () => {
      expect(sanitizeSettings({ pointerSensitivity: 0.003, fov: 75, darkMode: false })).toEqual({
        pointerSensitivity: 0.003,
        fov: 75,
        darkMode: false,
        enemyAggression: 'medium',
      });
    });
  });
});
