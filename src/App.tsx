import { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { useSettingsStore } from './store/settingsStore';
import { MainMenu } from './ui/MainMenu';
import { LevelSelect } from './ui/LevelSelect';
import { Settings } from './ui/Settings';
import { HUD } from './ui/HUD';
import { PauseOverlay } from './ui/PauseOverlay';
import { GameOverOverlay } from './ui/GameOverOverlay';
import { WinOverlay } from './ui/WinOverlay';
import { GameCanvas } from './ui/GameCanvas';
import { JsonMazeProvider } from './maze/JsonMazeProvider';
import type { MazeData } from './maze/types';

type UiScreen = 'menu' | 'levels' | 'settings' | 'game';

async function loadAllLevels(): Promise<{ id: string; name: string; data: MazeData }[]> {
  // Non-eager glob: level JSONs parse on demand when the user picks one,
  // instead of blocking the initial JS chunk with every level at startup.
  const modules = import.meta.glob('/public/levels/*.json');
  const provider = new JsonMazeProvider(
    Object.fromEntries(
      Object.entries(modules).map(([path, loader]) => {
        const id = path.split('/').pop()!.replace('.json', '');
        return [
          id,
          async () => {
            const mod = await loader();
            return (mod as { default?: unknown }).default ?? mod;
          },
        ];
      }),
    ),
  );
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const gameScreen = useGameStore((s) => s.screen);
  const darkMode = useSettingsStore((s) => s.darkMode);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
  }, [darkMode]);

  useEffect(() => {
    loadAllLevels()
      .then((lv) => {
        setLevels(lv);
        // Empty list is a benign state, not an error — LevelSelect renders
        // a neutral "暂无可用关卡" message in that case. Only network/parse
        // failures should paint the red error style.
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Failed to load levels', e);
        setLoadError(`关卡加载失败：${msg}`);
      });
  }, []);

  const startLevel = (id: string) => {
    const lv = levels.find((l) => l.id === id);
    if (!lv) return;
    useGameStore.getState().startLevel(lv.data);
    setActiveMaze(lv.data);
    setUiScreen('game');
  };

  const quitToMenu = () => {
    useGameStore.getState().goToMenu();
    setActiveMaze(null);
    setUiScreen('menu');
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {uiScreen === 'game' && activeMaze && (
        <GameCanvas key={activeMaze.id} maze={activeMaze} />
      )}
      {uiScreen === 'game' && gameScreen === 'playing' && <HUD />}
      {uiScreen === 'game' && gameScreen === 'paused' && (
        <>
          <HUD />
          <PauseOverlay onResume={() => useGameStore.getState().resume()} onQuit={quitToMenu} />
        </>
      )}
      {uiScreen === 'game' && gameScreen === 'game-over' && (
        <GameOverOverlay onRetry={() => activeMaze && startLevel(activeMaze.id)} onQuit={quitToMenu} />
      )}
      {uiScreen === 'game' && gameScreen === 'win' && (
        <WinOverlay onRetry={() => activeMaze && startLevel(activeMaze.id)} onQuit={quitToMenu} />
      )}
      {uiScreen === 'menu' && (
        <MainMenu onStart={() => setUiScreen('levels')} onSettings={() => setUiScreen('settings')} />
      )}
      {uiScreen === 'levels' && (
        <LevelSelect
          available={levels.map(({ id, name }) => ({ id, name }))}
          error={loadError}
          onPick={startLevel}
          onBack={() => setUiScreen('menu')}
        />
      )}
      {uiScreen === 'settings' && <Settings onBack={() => setUiScreen('menu')} />}
    </div>
  );
}
