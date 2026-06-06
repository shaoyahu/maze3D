import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../../src/store/settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      pointerSensitivity: 0.002,
      darkMode: false,
      set: useSettingsStore.getState().set,
    });
  });

  it('starts with default values', () => {
    const s = useSettingsStore.getState();
    expect(s.pointerSensitivity).toBe(0.002);
    expect(s.darkMode).toBe(false);
  });

  it('set updates a field and persists to localStorage', () => {
    useSettingsStore.getState().set('pointerSensitivity', 0.004);
    expect(useSettingsStore.getState().pointerSensitivity).toBe(0.004);
    const raw = localStorage.getItem('maze3d.settings.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.pointerSensitivity).toBe(0.004);
  });
});
