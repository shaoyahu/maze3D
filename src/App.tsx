import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { useLevelStore } from './store/levelStore';
import { useSettingsStore } from './store/settingsStore';
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
import { EditorPage } from './ui/editor/EditorPage';
import { ConfirmProvider } from './ui/useConfirm';
import type { MazeData, StartLevelOptions } from './maze/types';

type UiScreen = 'menu' | 'levels' | 'settings' | 'game' | 'editor';

// F-project-review-2026-06-13-D-10: build a human-readable toast message
// from the init-time loss summary. Each part of the summary (per-row
// drops + per-key migration errors) is rendered in its own clause so a
// user who lost both personal bests AND custom levels in the same init
// sees both, in order of severity. The id lists are trimmed to a
// reasonable cap so a wholesale-storage-corruption case (e.g. 200
// dropped customs) doesn't blow up the toast to the size of the screen.
function buildLoadSummaryMessage(s: NonNullable<ReturnType<typeof useLevelStore.getState>['lastLoadSummary']>): string {
  const MAX_IDS = 5;
  const parts: string[] = [];
  if (s.recordsMigrationError) {
    parts.push(`最佳成绩加载失败：${s.recordsMigrationError}`);
  }
  if (s.customsMigrationError) {
    parts.push(`自定义关卡加载失败：${s.customsMigrationError}`);
  }
  if (s.recordsDroppedKeys.length > 0) {
    const ids = s.recordsDroppedKeys.slice(0, MAX_IDS).join('、');
    const more = s.recordsDroppedKeys.length > MAX_IDS ? ` 等 ${s.recordsDroppedKeys.length} 项` : '';
    parts.push(`${s.recordsDroppedKeys.length} 个最佳成绩因格式不兼容而跳过：${ids}${more}`);
  }
  if (s.customsDroppedKeys.length > 0) {
    const ids = s.customsDroppedKeys.slice(0, MAX_IDS).join('、');
    const more = s.customsDroppedKeys.length > MAX_IDS ? ` 等 ${s.customsDroppedKeys.length} 项` : '';
    parts.push(`${s.customsDroppedKeys.length} 个自定义关卡因格式不兼容而跳过：${ids}${more}`);
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

export function App() {
  const [uiScreen, setUiScreen] = useState<UiScreen>('menu');
  const [levels, setLevels] = useState<{ id: string; name: string; data: MazeData }[]>([]);
  const [activeMaze, setActiveMaze] = useState<MazeData | null>(null);
  const [activeOptions, setActiveOptions] = useState<StartLevelOptions | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const gameScreen = useGameStore((s) => s.screen);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const customLevels = useLevelStore((s) => s.customLevels);
  // F-project-review-2026-06-13-D-10: the init layer surfaces dropped
  // records / customs / migration errors as `lastLoadSummary` on the
  // level store. The toast below consumes it on first mount so a user
  // whose personal bests or hand-crafted custom levels were rejected
  // for a schema-bump reason sees something other than a devtools
  // console.warn. Subscribed here (not in LevelSelect) so the message
  // appears regardless of which screen the user lands on after refresh.
  const lastLoadSummary = useLevelStore((s) => s.lastLoadSummary);
  const dismissLoadSummary = useLevelStore((s) => s.dismissLoadSummary);

  // P2-4b + F-project-review-2026-06-13-A-HIGH-4: wrap the module-level
  // BUILT_IN_JSON_PROVIDER singleton in an EditorMazeProvider so a custom
  // level and a built-in level with the same id both resolve, and so the
  // same lookup path is used for `startLevel` and the level list. The
  // built-in provider is constructed once at module load (see
  // `builtInLevels.ts`); only the editor overlay needs to rebuild when
  // `customLevels` changes.
  const provider = useMemo(
    () => new EditorMazeProvider(customLevels, BUILT_IN_JSON_PROVIDER),
    [customLevels],
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
  }, [darkMode]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    loadAllLevels(provider)
      .then((lv) => {
        if (cancelled) return;
        setLevels(lv);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Failed to load levels', e);
        setLoadError(`关卡加载失败：${msg}`);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  // F-M2: monotonic token bumped on every startLevel / quitToMenu. Async
  // .then / .catch callbacks capture the token at call time and bail if
  // a newer action has superseded them; without this, navigating away
  // mid-load would still call setUiScreen('game') and force the user
  // back into the level they tried to leave. The non-procedural branch
  // gets the same guard for consistency (the in-memory provider is
  // microsecond-fast, but the race window is still real).
  const loadTokenRef = useRef(0);

  const startLevel = (id: string, options?: StartLevelOptions) => {
    const myToken = ++loadTokenRef.current;
    // P2-3: ids starting with 'algo-v1-' are procedural seeds — we generate
    // the MazeData on demand via AlgorithmMazeProvider instead of looking
    // it up in the hand-crafted `levels` list. Anything else goes through
    // the EditorMazeProvider (custom + built-in).
    const isProcedural = id.startsWith('algo-v1-');
    if (isProcedural) {
      // F-N2: drop the dynamic import — AlgorithmMazeProvider is already
      // statically imported by LevelSelect.tsx / MainMenuScene.ts, so
      // Vite emitted a build warning ("dynamic import will not move
      // module into another chunk"). Static import here keeps the
      // generators in the main bundle (acknowledged — they're also
      // pulled in by LevelSelect on first render anyway).
      const algoProvider = new AlgorithmMazeProvider();
      algoProvider
        .load(id)
        .then((maze) => {
          if (loadTokenRef.current !== myToken) return;
          useGameStore.getState().startLevel(maze, options);
          setActiveMaze(maze);
          setActiveOptions(options);
          setUiScreen('game');
        })
        .catch((e) => {
          if (loadTokenRef.current !== myToken) return;
          const msg = e instanceof Error ? e.message : String(e);
          console.error('Failed to load procedural level', e);
          setLoadError(`关卡生成失败：${msg}`);
        });
      return;
    }
    provider
      .load(id)
      .then((maze) => {
        if (loadTokenRef.current !== myToken) return;
        useGameStore.getState().startLevel(maze, options);
        setActiveMaze(maze);
        setActiveOptions(options);
        setUiScreen('game');
      })
      .catch((e) => {
        if (loadTokenRef.current !== myToken) return;
        // Fall back to the in-memory list so a stale closure (e.g. a level
        // was deleted after the level list rendered) surfaces a useful
        // message instead of a raw provider error.
        const lv = levels.find((l) => l.id === id);
        if (lv) {
          useGameStore.getState().startLevel(lv.data, options);
          setActiveMaze(lv.data);
          setActiveOptions(options);
          setUiScreen('game');
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Failed to load level', e);
        setLoadError(`关卡加载失败：${msg}`);
      });
  };

  const quitToMenu = () => {
    // F-M2: cancel any in-flight procedural load before flipping the UI
    // back to the menu, so its .then can't setUiScreen('game') after us.
    loadTokenRef.current++;
    useGameStore.getState().goToMenu();
    setActiveMaze(null);
    setActiveOptions(undefined);
    setUiScreen('menu');
  };

  return (
    <ConfirmProvider>
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {uiScreen === 'game' && activeMaze && (
        <GameCanvas key={activeMaze.id} maze={activeMaze} options={activeOptions} />
      )}
      {uiScreen === 'game' && gameScreen === 'playing' && <HUD />}
      {uiScreen === 'game' && gameScreen === 'paused' && (
        <>
          <HUD />
          <PauseOverlay onResume={() => useGameStore.getState().resume()} onQuit={quitToMenu} />
        </>
      )}
      {uiScreen === 'game' && gameScreen === 'game-over' && (
        // F9: pass activeOptions so retry preserves the player's chosen
        // mode / surviveSeconds / enemyCount / spawnSchedule. Without
        // this, startLevel() falls back to maze.rules.victory = 'reach-exit'
        // and the default 3-enemy count, making every retry silently
        // revert the player's setup.
        <GameOverOverlay onRetry={() => activeMaze && startLevel(activeMaze.id, activeOptions)} onQuit={quitToMenu} />
      )}
      {uiScreen === 'game' && gameScreen === 'win' && (
        // F9: same fix for WinOverlay — both overlays share the bug.
        <WinOverlay onRetry={() => activeMaze && startLevel(activeMaze.id, activeOptions)} onQuit={quitToMenu} />
      )}
      {uiScreen === 'menu' && (
        <MainMenu
          onStart={() => setUiScreen('levels')}
          onSettings={() => setUiScreen('settings')}
          onEditor={() => setUiScreen('editor')}
        />
      )}
      {uiScreen === 'levels' && (
        <LevelSelect
          // P2-4b: the EditorMazeProvider merges custom + builtin into a
          // single id list. Custom levels already have their own group
          // ("我的关卡") rendered by LevelSelect, so we strip them from
          // the built-in list to avoid rendering the same level twice.
          available={levels
            .filter(({ id }) => !id.startsWith('custom-'))
            .map(({ id, name }) => ({ id, name }))}
          error={loadError}
          onPick={startLevel}
          onBack={() => setUiScreen('menu')}
        />
      )}
      {uiScreen === 'settings' && <Settings onBack={() => setUiScreen('menu')} />}
      {uiScreen === 'editor' && <EditorPage onExit={() => setUiScreen('menu')} />}
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
            {buildLoadSummaryMessage(lastLoadSummary)}
          </span>
          <button
            data-testid="load-summary-toast-dismiss"
            type="button"
            onClick={dismissLoadSummary}
            aria-label="关闭提示"
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
            关闭
          </button>
        </div>
      )}
    </div>
    </ConfirmProvider>
  );
}
