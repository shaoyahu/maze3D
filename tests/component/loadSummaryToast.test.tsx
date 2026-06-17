import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App } from '../../src/App';
import { useLevelStore } from '../../src/store/levelStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useGameStore } from '../../src/store/gameStore';

// F-project-review-2026-06-13-D-10: the init layer surfaces dropped
// records / customs / migration errors as `lastLoadSummary` on the level
// store. The UI must consume it as a one-time toast so a user whose
// personal bests or hand-crafted custom levels were rejected for a
// schema-bump reason sees something other than a devtools console.warn.

vi.mock('../../src/ui/GameCanvas', () => ({
  GameCanvas: () => <div data-testid="game-canvas-stub" />,
}));

vi.mock('../../src/ui/LevelSelect', () => ({
  LevelSelect: () => <div data-testid="level-select-stub" />,
}));

vi.mock('../../src/maze/EditorMazeProvider', () => ({
  EditorMazeProvider: class {
    async list() { return []; }
    async load() { throw new Error('not used'); }
  },
}));

describe('App loadSummary toast (D-10)', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      pointerSensitivity: 0.002,
      fov: 60,
      darkMode: false,
      set: useSettingsStore.getState().set,
    });
    useLevelStore.setState({
      customLevels: {},
      bestByLevel: {},
      lastLoadSummary: null,
    });
    useGameStore.getState().goToMenu();
  });

  it('does not render the toast when lastLoadSummary is null', () => {
    render(<App />);
    expect(screen.queryByTestId('load-summary-toast')).toBeNull();
  });

  it('renders a toast when lastLoadSummary has dropped custom levels', () => {
    // Arrange — seed the store with a summary listing one dropped custom level.
    act(() => {
      useLevelStore.setState({
        lastLoadSummary: {
          recordsDroppedKeys: [],
          customsDroppedKeys: ['custom-stale'],
          foldersDroppedKeys: [],
          recordsMigrationError: null,
          customsMigrationError: null,
        },
      });
    });
    // Act
    render(<App />);
    // Assert
    const toast = screen.getByTestId('load-summary-toast');
    expect(toast).toBeTruthy();
    // The message names the dropped level so the user can identify it.
    expect(toast.textContent).toContain('custom-stale');
  });

  it('renders a toast when lastLoadSummary has dropped best records', () => {
    act(() => {
      useLevelStore.setState({
        lastLoadSummary: {
          recordsDroppedKeys: ['l1-old'],
          customsDroppedKeys: [],
          foldersDroppedKeys: [],
          recordsMigrationError: null,
          customsMigrationError: null,
        },
      });
    });
    render(<App />);
    const toast = screen.getByTestId('load-summary-toast');
    expect(toast).toBeTruthy();
    expect(toast.textContent).toContain('l1-old');
  });

  it('renders a migration-error toast when recordsMigrationError is set', () => {
    act(() => {
      useLevelStore.setState({
        lastLoadSummary: {
          recordsDroppedKeys: [],
          customsDroppedKeys: [],
          foldersDroppedKeys: [],
          recordsMigrationError: 'schema v2 not supported',
          customsMigrationError: null,
        },
      });
    });
    render(<App />);
    const toast = screen.getByTestId('load-summary-toast');
    expect(toast).toBeTruthy();
    expect(toast.textContent).toContain('schema v2 not supported');
  });

  it('clicking the dismiss button calls dismissLoadSummary and clears the toast', () => {
    act(() => {
      useLevelStore.setState({
        lastLoadSummary: {
          recordsDroppedKeys: ['l1'],
          customsDroppedKeys: ['custom-x'],
          foldersDroppedKeys: [],
          recordsMigrationError: null,
          customsMigrationError: null,
        },
      });
    });
    const dismissSpy = vi.spyOn(useLevelStore.getState(), 'dismissLoadSummary');
    try {
      render(<App />);
      const dismissBtn = screen.getByTestId('load-summary-toast-dismiss');
      fireEvent.click(dismissBtn);
      expect(dismissSpy).toHaveBeenCalledTimes(1);
      expect(useLevelStore.getState().lastLoadSummary).toBeNull();
    } finally {
      dismissSpy.mockRestore();
    }
  });
});
