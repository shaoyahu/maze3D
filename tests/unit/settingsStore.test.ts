import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore, sanitizeSettings } from '../../src/store/settingsStore';
import { flushPendingWrites } from '../../src/store/persist';

describe('settingsStore', () => {
  beforeEach(() => {
    // P2-11 (A-M7): clear any pending debounced writes from a previous
    // test so a timer firing during this test doesn't pollute the
    // localStorage assertion. The seam is intentionally the same
    // operation a future "force-flush on logout" caller would use.
    flushPendingWrites();
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
    // P2-11 (A-M7): the localStorage write is debounced 250ms; flush
    // it explicitly before reading. The seam is the same operation
    // the production pagehide/visibilitychange listeners invoke on
    // tab close.
    flushPendingWrites();
    const raw = localStorage.getItem('maze3d.settings.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.fov).toBe(75);
  });

  it('set updates enemyAggression, persists to localStorage, and round-trips on reload (P2-4a)', () => {
    useSettingsStore.getState().set('enemyAggression', 'hard');
    expect(useSettingsStore.getState().enemyAggression).toBe('hard');
    // P2-11: see above — flush the debounced write before reading.
    flushPendingWrites();
    const raw = localStorage.getItem('maze3d.settings.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.enemyAggression).toBe('hard');
    // The new store re-reads from localStorage on init, so a fresh
    // module import would land on 'hard' — covered here by reading the
    // raw blob that the next store would consume.
  });

  // P2-11 (A-M7): the A-M7 finding's hot-path concern. Without
  // debouncing, dragging a sensitivity slider would block the JS
  // thread on N synchronous JSON.stringify + setItem calls. With
  // debouncing, the in-memory state still updates synchronously (the
  // UI is responsive) and the localStorage write happens 250ms later.
  it('set updates the in-memory state immediately but does not write to localStorage synchronously (A-M7)', () => {
    useSettingsStore.getState().set('pointerSensitivity', 0.005);
    // In-memory state: updated.
    expect(useSettingsStore.getState().pointerSensitivity).toBe(0.005);
    // localStorage: still empty — the write is debounced.
    expect(localStorage.getItem('maze3d.settings.v1')).toBeNull();
  });

  it('N set calls within the debounce window coalesce into 1 localStorage write of the latest value (A-M7)', () => {
    // The realistic case from the A-M7 finding: a slider drag fires
    // set(0.002) → set(0.003) → set(0.004) within ~100ms. After flush,
    // localStorage must contain only the latest value (0.004), and
    // the in-memory state must reflect it.
    const s = useSettingsStore.getState().set;
    s('pointerSensitivity', 0.003);
    s('pointerSensitivity', 0.004);
    s('pointerSensitivity', 0.005);
    flushPendingWrites();
    const raw = localStorage.getItem('maze3d.settings.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.pointerSensitivity).toBe(0.005);
    // In-memory state already at 0.005 from the last set.
    expect(useSettingsStore.getState().pointerSensitivity).toBe(0.005);
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
        language: 'zh', // P2-8 lenient default for pre-P2-8 records
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
        language: 'zh',
      });
    });
  });
});
