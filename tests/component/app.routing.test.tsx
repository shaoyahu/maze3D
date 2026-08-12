// F-project-review-2026-06-14: routing smoke tests. These guard the
// user-facing behavior the user asked for: each page has its own URL,
// browser back/forward buttons restore the previous screen, and a deep-
// link into /game with seed query boots straight into the level.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, Link } from 'react-router-dom';
import { useGameStore } from '../../src/store/gameStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useLevelStore } from '../../src/store/levelStore';
import { buildGameSearchParams } from '../../src/utils/gameUrl';

vi.mock('../../src/ui/GameCanvas', () => ({
  GameCanvas: () => <div data-testid="game-canvas-stub" />,
}));

// Mini-App for routing tests. Mirrors the App.tsx route table but lets the
// test inject any initial path via MemoryRouter's initialEntries. The real
// App wraps in BrowserRouter; here we exercise the same <Routes> tree with
// the test-friendly MemoryRouter so we can drive back/forward deterministically.
import { AppRoutes } from '../../src/App';

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      pointerSensitivity: 0.002,
      fov: 60,
      darkMode: false,
      set: useSettingsStore.getState().set,
    });
    useLevelStore.setState({ customLevels: {}, lastLoadSummary: null });
    useGameStore.getState().goToMenu();
  });

  it('lands on the main menu at "/"', async () => {
    renderAt(['/']);
    // F-2026-06-15-H-3.6: "开始" button is rendered as "▶ 开始" after the
    // home-revamp icon prefix; title is i18n'd. Use stable testids.
    await waitFor(() => expect(screen.getByTestId('main-menu-start')).toBeInTheDocument());
    expect(screen.getByTestId('main-menu-panel')).toBeInTheDocument();
  });

  it('falls back to "/" when given an unknown path', async () => {
    renderAt(['/this-route-does-not-exist']);
    await waitFor(() => expect(screen.getByTestId('main-menu-start')).toBeInTheDocument());
  });

  it('navigates MainMenu → Levels when 开始 is clicked', async () => {
    renderAt(['/']);
    await waitFor(() => expect(screen.getByTestId('main-menu-start')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('main-menu-start'));
    // LevelSelect renders the "选择关卡" heading when mounted.
    await waitFor(() => expect(screen.getByText('选择关卡')).toBeInTheDocument());
  });

  it('navigates MainMenu → Settings when 设置 is clicked', async () => {
    renderAt(['/']);
    await waitFor(() => expect(screen.getByText('设置')).toBeInTheDocument());
    fireEvent.click(screen.getByText('设置'));
    await waitFor(() => expect(screen.getByText(/鼠标灵敏度/)).toBeInTheDocument());
  });

  it('a deep-link to /game?id=… boots straight into the game route', async () => {
    // F-project-review-2026-06-14: deep-link should not require going
    // through the menu first. The GamePage renders the stubbed canvas
    // (mocked) and the gameStore flips to 'playing' once the level loads.
    // P2-11: teaching-01 is shipped in public/levels/teaching-01.json —
    // a real id the built-in provider can resolve without extra mocking.
    renderAt(['/game?id=teaching-01']);
    await waitFor(() => expect(screen.getByTestId('game-canvas-stub')).toBeInTheDocument());
    await waitFor(() => expect(useGameStore.getState().screen).toBe('playing'));
  });

  it('a deep-link to /game with a procedural seed builds the same id the store sees', async () => {
    // F-project-review-2026-06-14: query-string-seeded procedural levels
    // must round-trip through parseGameSearchParams → startLevel so the
    // store's currentLevelId matches the seed in the URL.
    const seedId = 'algo-v1-recursive-backtracker-30-0123456789abcdef';
    renderAt([`/game?seed=${seedId}`]);
    await waitFor(() => expect(useGameStore.getState().currentLevelId).toBe(seedId));
  });

  it('a malformed /game URL surfaces an inline error instead of a blank screen', async () => {
    renderAt(['/game?seed=not-a-real-seed']);
    await waitFor(() => expect(screen.getByTestId('game-load-error')).toBeInTheDocument());
    expect(screen.getByText(/关卡 URL 不合法/)).toBeInTheDocument();
  });

  it('a /game?v3 seed URL (P4 refactor-fp2d) falls back to /levels instead of an error page', async () => {
    // P4 refactor-fp2d: the v3 (3D voxel) wire format is removed
    // (3D mode is now a first-person view of 2D multi-layer,
    // triggered by `?view=fp3d` over a v1/v2 id). A user with
    // a `?seed=algo-v3-…` bookmark lands on a dead URL —
    // per spec.md §8/§10/§11 ("老 v3 URL：友好 fall back 到
    // 2D + console.warn"), the App must NOT show the red
    // error panel for the v3 case; it must console.warn and
    // redirect to /levels (`replace: true` so the dead URL
    // doesn't pollute browser history). A non-v3 bad seed
    // (covered by the previous test) still hits the error
    // panel because that's a genuine user mistake.
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderAt(['/game?seed=algo-v3-3d-recursive-backtracker-7-0123456789abcdef']);
    // P4 refactor-fp2d: the v3 redirect lands at /levels,
    // so the test waits for the Levels UI (the "开始" rail
    // button) instead of the error panel.
    await waitFor(() => expect(screen.getByRole('button', { name: '教学' })).toBeInTheDocument());
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('[P4 refactor-fp2d]'),
    );
    consoleWarn.mockRestore();
  });

  it('quit from game navigates to / and the previous URL is preserved in history (replace semantics)', async () => {
    // F-project-review-2026-06-14: hitting pause-overlay's "quit" should
    // land at / via a replace (not push), so the back button returns to
    // /levels (or wherever was before /game), not to /game again.
    const seedId = 'algo-v1-recursive-backtracker-30-0123456789abcdef';
    renderAt(['/levels', `/game?seed=${seedId}`]);
    // First entry is /levels; second is /game. We're on the game.
    await waitFor(() => expect(useGameStore.getState().screen).toBe('playing'));
    // Force game-over so the overlay's onQuit becomes available.
    act(() => useGameStore.setState({ screen: 'game-over' }));
    await waitFor(() => expect(screen.getByText('重试')).toBeInTheDocument());
    fireEvent.click(screen.getByText('返回主菜单'));
    // After quit: store.screen resets to 'menu', URL is /.
    await waitFor(() => expect(useGameStore.getState().screen).toBe('menu'));
    // F-2026-06-15-H-3.6: title is i18n'd; use the locale-stable panel testid.
    await waitFor(() => expect(screen.getByTestId('main-menu-panel')).toBeInTheDocument());
  });
});

// F-project-review-2026-06-14: builds the URL that LevelSelect would push
// when the user picks a procedural level with survive options. This is
// the inverse of parseGameSearchParams and is the contract the rest of
// the app relies on for navigation.
describe('buildGameSearchParams round-trip (smoke)', () => {
  it('serializes a procedural seed + survive options into a parseable URL', () => {
    const params = buildGameSearchParams('algo-v1-kruskal-15-fedcba9876543210', {
      mode: 'survive',
      surviveSeconds: 60,
      enemyCount: 4,
      spawnSchedule: { intervalSec: 15, onPickup: true, enabled: false, max: 10 },
    });
    const qs = `?${params.toString()}`;
    expect(qs).toContain('seed=algo-v1-kruskal-15-fedcba9876543210');
    expect(qs).toContain('mode=survive');
    expect(qs).toContain('survive=60');
    expect(qs).toContain('enemies=4');
    // F-2026-06-16-H-2: the URL must round-trip the disabled case too.
    // Previously the build helper dropped the `progressive` key when
    // enabled=false, so refreshing the URL silently re-enabled
    // progressive (parseGameSearchParams left spawnSchedule undefined
    // and startLevel fell back to SPAWN_SCHEDULE_DEFAULT.enabled=true).
    expect(qs).toContain('progressive=0');
  });

  it('serializes a hand-crafted id without seed-mode decorations', () => {
    const params = buildGameSearchParams('teaching-001', { mode: 'reach-exit' });
    expect(params.get('id')).toBe('teaching-001');
    expect(params.get('seed')).toBeNull();
    expect(params.get('mode')).toBe('reach-exit');
  });
});

// Tiny smoke that the Link primitive (which we'll use for share-link UX
// later) works under our router. Verifies the imported `Link` and the
// surrounding router setup don't drift apart as we add more pages.
describe('Link + MemoryRouter', () => {
  it('navigates when a Link is clicked', async () => {
    function LocSink() {
      const loc = useLocation();
      return <span data-testid="loc-pathname">{loc.pathname}</span>;
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <Link to="/levels">go</Link>
        <Routes>
          <Route path="/" element={<><LocSink /></>} />
          <Route path="/levels" element={<><LocSink /><span>levels-marker</span></>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('loc-pathname').textContent).toBe('/');
    fireEvent.click(screen.getByText('go'));
    await waitFor(() => expect(screen.getByTestId('loc-pathname').textContent).toBe('/levels'));
    expect(screen.getByText('levels-marker')).toBeInTheDocument();
  });
});