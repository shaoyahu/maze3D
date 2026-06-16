import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainMenu } from '../../src/ui/MainMenu';

// Post-home-revamp: the Three.js scene container and the WebGL-init
// fallback path were both removed (see F-2026-06-15-H-3.6). These
// tests cover the post-revamp MainMenu: panel, title, button wiring,
// and clean unmount. The previous scene-container + WebGL-fallback
// assertions lived here too but were `it.skip`ed as dead code; they
// have been removed along with src/ui/MainMenuScene.ts.

describe('MainMenu P2-5 revamp', () => {
  beforeEach(() => {
    // 让 console.warn 不刷屏
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // P3-C-M7: pair install with mockRestore via vi.restoreAllMocks().
  // Without this, the console.warn spy installed in beforeEach leaks
  // into every subsequent test in the worker — silencing real warnings
  // (including any Three.js / React warnings a later test depends on).
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title inside the panel', () => {
    render(<MainMenu onStart={() => {}} onSettings={() => {}} />);
    // F-2026-06-15-H-3.6: title is now t('app.menu.title') — '3D Maze' in
    // en, '3D 迷宫' in zh. Use the panel testid for a locale-stable check
    // (the panel wraps the <h1> so its presence proves the title rendered).
    expect(screen.getByTestId('main-menu-panel')).toBeInTheDocument();
  });

  it('hoverLift buttons still fire onStart / onSettings / onEditor', () => {
    const onStart = vi.fn();
    const onSettings = vi.fn();
    const onEditor = vi.fn();
    render(
      <MainMenu onStart={onStart} onSettings={onSettings} onEditor={onEditor} />,
    );
    fireEvent.click(screen.getByTestId('main-menu-start'));
    expect(onStart).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('main-menu-editor'));
    expect(onEditor).toHaveBeenCalled();
    fireEvent.click(screen.getByText('设置'));
    expect(onSettings).toHaveBeenCalled();
  });

  it('cleans up scene on unmount (no console errors)', () => {
    const { unmount } = render(<MainMenu onStart={() => {}} onSettings={() => {}} />);
    expect(() => unmount()).not.toThrow();
  });
});
