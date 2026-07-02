import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useGameStore } from './store/gameStore';
import { useLevelStore } from './store/levelStore';
import { useSettingsStore } from './store/settingsStore';
// F-2026-07-01-FCR-L-7: lazy-load the heavy editor route so Three.js and the
// editor's full component tree (drawer / panels / viewport) don't land
// in the initial bundle. MainMenu / LevelSelect / Settings stay eager —
// they're tiny and the home route is the cold-start entry point.
const EditorPage = lazy(() =>
  import('./ui/editor/EditorPage').then((m) => ({ default: m.EditorPage })),
);
import { MainMenu } from './ui/MainMenu';
import { LevelSelect } from './ui/LevelSelect';
import { Settings } from './ui/Settings';
import { HUD } from './ui/HUD';
import { PauseOverlay } from './ui/PauseOverlay';
import { GameOverOverlay } from './ui/GameOverOverlay';
import { WinOverlay } from './ui/WinOverlay';
import { GameCanvas } from './ui/GameCanvas';
import { BUILT_IN_JSON_PROVIDER } from './maze/builtInLevels';
import { EditorMazeProvider } from './maze/EditorMazeProvider';
import { AlgorithmMazeProvider } from './maze/AlgorithmMazeProvider';
import { ConfirmProvider } from './ui/useConfirm';
import { LevelLoadError, clampErrorValue } from './utils/errors';
import type { MazeData, StartLevelOptions } from './maze/types';
import { buildGameSearchParams, parseGameSearchParams } from './utils/gameUrl';
import { useT } from './i18n';

// F-project-review-2026-06-13-D-10: build a human-readable toast message
// from the init-time loss summary. Each part of the summary (per-row
// drops + per-key migration errors) is rendered in its own clause so a
// user who lost both personal bests AND custom levels in the same init
// sees both, in order of severity. The id lists are trimmed to a
// reasonable cap so a wholesale-storage-corruption case (e.g. 200
// dropped customs) doesn't blow up the toast to the size of the screen.
function buildLoadSummaryMessage(t: (key: string, vars?: Record<string, string | number>) => string, s: NonNullable<ReturnType<typeof useLevelStore.getState>['lastLoadSummary']>): string {
  const MAX_IDS = 5;
  const parts: string[] = [];
  if (s.recordsMigrationError) {
    parts.push(t('app.error.recordsMigration', { msg: s.recordsMigrationError }));
  }
  if (s.customsMigrationError) {
    parts.push(t('app.error.customsMigration', { msg: s.customsMigrationError }));
  }
  if (s.recordsDroppedKeys.length > 0) {
    const ids = s.recordsDroppedKeys.slice(0, MAX_IDS).join('、');
    const more = s.recordsDroppedKeys.length > MAX_IDS ? t('common.moreSuffix', { count: s.recordsDroppedKeys.length }) : '';
    parts.push(t('app.error.recordsDropped', { count: s.recordsDroppedKeys.length, ids, more }));
  }
  if (s.customsDroppedKeys.length > 0) {
    const ids = s.customsDroppedKeys.slice(0, MAX_IDS).join('、');
    const more = s.customsDroppedKeys.length > MAX_IDS ? t('common.moreSuffix', { count: s.customsDroppedKeys.length }) : '';
    parts.push(t('app.error.customsDropped', { count: s.customsDroppedKeys.length, ids, more }));
  }
  return parts.join('；');
}

async function loadAllLevels(
  provider: EditorMazeProvider,
): Promise<{ id: string; name: string; data: MazeData }[]> {
  const ids = await provider.list();
  const out: { id: string; name: string; data: MazeData }[] = [];
  for (const id of ids) {
    // Per-level try/catch: a single malformed level JSON must not block
    // loading the rest. The user sees only the levels that successfully
    // validated; the broken one is logged for the developer.
    try {
      const m = await provider.load(id);
      out.push({ id: m.id, name: m.name, data: m });
    } catch (e) {
      console.warn(`loadAllLevels: skipping level '${id}' due to validation error`, e);
    }
  }
  return out;
}

// Shell that wires the dark-mode side-effect + level-list loader + toast
// once at the router root. Children render the routed page.
function AppShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const darkMode = useSettingsStore((s) => s.darkMode);
  const customLevels = useLevelStore((s) => s.customLevels);
  const lastLoadSummary = useLevelStore((s) => s.lastLoadSummary);
  const dismissLoadSummary = useLevelStore((s) => s.dismissLoadSummary);
  // F-2026-06-15-H-3.1: surface write failures from levelStore so quota /
  // private-mode storage errors no longer silently drop best records and
  // custom levels.
  const lastWriteError = useLevelStore((s) => s.lastWriteError);
  const dismissWriteError = useLevelStore((s) => s.dismissWriteError);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
  }, [darkMode]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
      {lastLoadSummary && (
        // F-project-review-2026-06-13-D-10: one-time toast surfacing the
        // init-time loss summary. Renders inside the positioned wrapper
        // so the absolute positioning is relative to the viewport-sized
        // root (the same coordinate space the existing overlays use).
        // Dismiss button clears the field; the next page load will
        // re-evaluate localStorage and re-surface a fresh summary if
        // the underlying data is still in the broken state.
        <div
          data-testid="load-summary-toast"
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            maxWidth: 560,
            padding: '12px 16px',
            background: 'var(--panel)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 1000,
          }}
        >
          <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>
            {buildLoadSummaryMessage(t, lastLoadSummary)}
          </span>
          <button
            data-testid="load-summary-toast-dismiss"
            type="button"
            onClick={dismissLoadSummary}
            aria-label={t('app.error.bannerCloseAria')}
            style={{
              padding: '4px 10px',
              fontSize: 13,
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--fg)',
              cursor: 'pointer',
            }}
          >
            {t('app.error.bannerClose')}
          </button>
        </div>
      )}
      {lastWriteError && (
        // F-2026-06-15-H-3.1: write-failure toast. Renders above the
        // load-summary toast (bottom: 80) so both can be visible at once.
        // Same dismissal pattern.
        <div
          data-testid="write-error-toast"
          role="alert"
          aria-live="assertive"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 80,
            transform: 'translateX(-50%)',
            maxWidth: 560,
            padding: '12px 16px',
            background: 'var(--panel)',
            color: 'var(--fg)',
            border: '1px solid var(--danger)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 1000,
          }}
        >
          <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>
            {t(
              lastWriteError.kind === 'record'
                ? 'app.error.writeFailedRecord'
                : 'app.error.writeFailedCustomLevel',
              { reason: t(`editor.persist.reason.${lastWriteError.reason}`) },
            )}
          </span>
          <button
            data-testid="write-error-toast-dismiss"
            type="button"
            onClick={dismissWriteError}
            aria-label={t('app.error.bannerCloseAria')}
            style={{
              padding: '4px 10px',
              fontSize: 13,
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--fg)',
              cursor: 'pointer',
            }}
          >
            {t('app.error.bannerClose')}
          </button>
        </div>
      )}
      {/* keep customLevels referenced so a store change re-renders the shell
          and any consumer that needs the provider refreshes. Provider is
          built inside LevelsPage / GamePage via the loader hook below. */}
      <input type="hidden" data-testid="custom-levels-rev" value={Object.keys(customLevels).length} />
    </div>
  );
}

// Custom hook: build the editor-aware provider and async-load all levels.
// Shared between LevelsPage (to render the dropdown) and GamePage (so the
// id passed in the URL can be resolved through the same path).
function useLevelList(): {
  levels: { id: string; name: string; data: MazeData }[];
  provider: EditorMazeProvider;
  error: string | null;
} {
  const customLevels = useLevelStore((s) => s.customLevels);
  const provider = useMemo(
    () => new EditorMazeProvider(customLevels, BUILT_IN_JSON_PROVIDER),
    [customLevels],
  );
  const [levels, setLevels] = useState<{ id: string; name: string; data: MazeData }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadAllLevels(provider)
      .then((lv) => {
        if (cancelled) return;
        setLevels(lv);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Failed to load levels', e);
        setError(`关卡加载失败：${msg}`);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);
  return { levels, provider, error };
}

function MenuPage() {
  const navigate = useNavigate();
  return (
    <MainMenu
      onStart={() => navigate('/levels')}
      onSettings={() => navigate('/settings')}
      onEditor={() => navigate('/editor')}
    />
  );
}

function LevelsPage() {
  const navigate = useNavigate();
  const { levels, error } = useLevelList();
  return (
    <LevelSelect
      // P2-4b: the EditorMazeProvider merges custom + builtin into a
      // single id list. Custom levels already have their own group
      // ("我的关卡") rendered by LevelSelect, so we strip them from
      // the built-in list to avoid rendering the same level twice.
      // F-redesign-2026-06-14: also pass the full MazeData so the new
      // card UI can render an SVG thumbnail + best-record summary
      // without re-loading via the provider.
      available={levels
        .filter(({ id }) => !id.startsWith('custom-'))
        .map(({ id, name, data }) => ({ id, name, data }))}
      error={error}
      onPick={(id, options) => {
        // F-project-review-2026-06-14: build the /game URL from the id +
        // options. push (not replace) so browser back returns to /levels.
        const search = buildGameSearchParams(id, options);
        navigate({ pathname: '/game', search: `?${search.toString()}` });
      }}
      onBack={() => navigate(-1)}
    />
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  return (
    <Settings
      // F-redesign-2026-06-14: ESC must leave /settings in ONE press.
      // The previous navigate(-1) popped only one history entry, so a
      // user who had clicked the section nav (which appends
      // #section-display / #section-input / #section-gameplay entries
      // to history) had to press ESC 2-4 times to reach the real
      // previous page. Replacing the current /settings entry with /
      // (replace: true) collapses all accumulated hash entries and
      // lands the user directly on the main menu. Browser-back from /
      // then skips the settings surface entirely.
      onBack={() => navigate('/', { replace: true })}
    />
  );
}

function EditorRoutePage() {
  const navigate = useNavigate();
  return <EditorPage onExit={() => navigate('/', { replace: true })} />;
}

// GamePage owns the maze lifecycle for /game. The id + options live in the
// URL query string, so re-mounting the route (e.g. via browser back into
// /game?…) re-runs the load with the same inputs the user originally picked.
function GamePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gameScreen = useGameStore((s) => s.screen);
  const { provider, error: loadError } = useLevelList();

  // F-project-review-2026-06-14: parse the query string into (id, options)
  // or surface a structured error. `loadError` from useLevelList already
  // covers provider load failures; bad-URL is its own bucket because the
  // provider was never asked for anything yet.
  const parsed = useMemo(() => parseGameSearchParams(searchParams), [searchParams]);

  const [activeMaze, setActiveMaze] = useState<MazeData | null>(null);
  const [activeOptions, setActiveOptions] = useState<StartLevelOptions | undefined>(undefined);
  const [urlError, setUrlError] = useState<string | null>(null);

  // F-M2: monotonic token bumped on every startLevel / quitToMenu. Async
  // .then / .catch callbacks capture the token at call time and bail if
  // a newer action has superseded them; without this, navigating away
  // mid-load would still setActiveMaze the new maze even though the user
  // already left /game.
  const loadTokenRef = useRef(0);

  const startLevel = useCallback(
    (id: string, options?: StartLevelOptions) => {
      const myToken = ++loadTokenRef.current;
      // P2-3: ids starting with 'algo-v1-' are procedural seeds — we generate
      // the MazeData on demand via AlgorithmMazeProvider instead of looking
      // it up in the hand-crafted `levels` list. Anything else goes through
      // the EditorMazeProvider (custom + built-in).
      const isProcedural = id.startsWith('algo-v1-');
      const handleLoaded = (maze: MazeData) => {
        if (loadTokenRef.current !== myToken) return;
        useGameStore.getState().startLevel(maze, options);
        setActiveMaze(maze);
        setActiveOptions(options);
        setUrlError(null);
      };
      if (isProcedural) {
        // F-N2: AlgorithmMazeProvider is already statically imported.
        const algoProvider = new AlgorithmMazeProvider();
        algoProvider
          .load(id)
          .then(handleLoaded)
          .catch((e) => {
            if (loadTokenRef.current !== myToken) return;
            const msg = e instanceof Error ? e.message : String(e);
            console.error('Failed to load procedural level', e);
            setUrlError(`关卡生成失败：${msg}`);
          });
        return;
      }
      provider
        .load(id)
        .then(handleLoaded)
        .catch((e) => {
          if (loadTokenRef.current !== myToken) return;
          // F-project-review-2026-06-14: surface a structured LevelLoadError
          // so the LevelSelect error UI / a future toast can render it. The
          // id is clamped so a hand-crafted level with a 10 MB name field
          // doesn't blow up the overlay.
          const detail = e instanceof Error ? e.message : String(e);
          console.error('Failed to load level', e);
          setUrlError(`关卡加载失败：${clampErrorValue(detail)}（id=${clampErrorValue(id)}）`);
        });
    },
    [provider],
  );

  // Kick off the load whenever the parsed URL changes. The dependency
  // includes parsed.id (so a different level re-loads) and parsed.options
  // (so changing mode/survive/etc. re-loads). For the non-procedural path
  // options is always {} so a back/forward between identical ?id= URLs
  // would re-run startLevel — that matches today's behavior where
  // navigating into the same level re-initializes the game state.
  useEffect(() => {
    // F-2026-06-15-M-4.1: bump the token at the head of the effect
    // body — not only in the cleanup. The cleanup only fires when the
    // EFFECT itself unmounts, which happens after the next effect
    // already ran. Without an in-body bump, an old in-flight .then()
    // can race ahead of the cleanup and write stale state. Putting the
    // bump first makes every (re-)run start with a fresh token.
    loadTokenRef.current++;
    if (!parsed.ok) {
      setUrlError(`关卡 URL 不合法：${parsed.error}`);
      setActiveMaze(null);
      setActiveOptions(undefined);
      return;
    }
    startLevel(parsed.parsed.id, parsed.parsed.options);
    // Reset on unmount too: any in-flight load is invalidated by the
    // loadTokenRef bump in quitToMenu, but bumping here also covers the
    // case where GamePage unmounts without going through quitToMenu
    // (e.g. user typed a new URL into the address bar).
    return () => {
      loadTokenRef.current++;
    };
  }, [parsed, startLevel]);

  const quitToMenu = () => {
    // F-M2: cancel any in-flight procedural load before flipping the UI
    // back to the menu, so its .then can't setActiveMaze the new maze
    // after we've left.
    loadTokenRef.current++;
    useGameStore.getState().goToMenu();
    setActiveMaze(null);
    setActiveOptions(undefined);
    // F-project-review-2026-06-14: replace (not push) so the user's
    // history entry for /game is collapsed and back returns to whatever
    // was before the game (e.g. /levels).
    navigate('/', { replace: true });
  };

  // Surface the structured error as a typed exception so the existing
  // LevelSelect-style error UI can render it; here we just hand it to
  // a small inline panel because GamePage has no LevelSelect layout.
  if (urlError || (loadError && !activeMaze)) {
    return (
      <div
        data-testid="game-load-error"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          color: 'var(--fg)',
          background: 'var(--bg)',
        }}
      >
        <p style={{ color: 'var(--danger)', maxWidth: 480, textAlign: 'center' }}>
          {urlError ?? loadError}
        </p>
        <button
          type="button"
          data-testid="game-load-error-back"
          onClick={() => navigate('/', { replace: true })}
          style={{
            padding: '8px 16px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--fg)',
            cursor: 'pointer',
          }}
        >
          返回主菜单
        </button>
      </div>
    );
  }

  return (
    <>
      {activeMaze && <GameCanvas key={activeMaze.id} maze={activeMaze} options={activeOptions} />}
      {activeMaze && gameScreen === 'playing' && <HUD />}
      {activeMaze && gameScreen === 'paused' && (
        <>
          <HUD />
          <PauseOverlay onResume={() => useGameStore.getState().resume()} onQuit={quitToMenu} />
        </>
      )}
      {activeMaze && gameScreen === 'game-over' && (
        // F9: pass activeOptions so retry preserves the player's chosen
        // mode / surviveSeconds / enemyCount / spawnSchedule. Without
        // this, startLevel() falls back to maze.rules.victory = 'reach-exit'
        // and the default 3-enemy count, making every retry silently
        // revert the player's setup.
        <GameOverOverlay
          onRetry={() => activeMaze && startLevel(activeMaze.id, activeOptions)}
          onQuit={quitToMenu}
        />
      )}
      {activeMaze && gameScreen === 'win' && (
        // F9: same fix for WinOverlay — both overlays share the bug.
        <WinOverlay
          onRetry={() => activeMaze && startLevel(activeMaze.id, activeOptions)}
          onQuit={quitToMenu}
          onLevels={() => navigate('/levels')}
        />
      )}
    </>
  );
}

// F-project-review-2026-06-14: AppRoutes is the routed UI without the
// router provider. main.tsx wraps it in BrowserRouter for production;
// tests wrap it in MemoryRouter for deterministic initial-path control.
// Splitting these out avoids the "rendered <Router> inside another
// <Router>" invariant when a test wants to drive back/forward manually.
export function AppRoutes() {
  return (
    <ConfirmProvider>
      <AppShell>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<MenuPage />} />
            <Route path="/levels" element={<LevelsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/editor" element={<EditorRoutePage />} />
            <Route path="/game" element={<GamePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </ConfirmProvider>
  );
}

export function App() {
  // Pinned to vite's `base` so the basename follows the build target:
  // dev  → '/'            (localhost:5173/)
  // prod → '/maze3D/'     (https://<user>.github.io/maze3D/)
  // React Router expects basename *without* a trailing slash, while
  // import.meta.env.BASE_URL is delivered *with* one — strip it.
  // Falling back to undefined keeps tests / non-vite consumers working
  // when BASE_URL is just '/'.
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined;
  return (
    <BrowserRouter basename={basename}>
      <AppRoutes />
    </BrowserRouter>
  );
}

// F-project-review-2026-06-14: re-export LevelLoadError so the error panel
// above can throw it through hooks (e.g. future suspense integration).
export { LevelLoadError };