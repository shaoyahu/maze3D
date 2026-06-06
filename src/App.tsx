import { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
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
  const modules = import.meta.glob('/public/levels/*.json', { eager: true });
  const provider = new JsonMazeProvider(
    Object.fromEntries(
      Object.entries(modules).map(([path, mod]) => {
        const id = path.split('/').pop()!.replace('.json', '');
        const data = (mod as { default?: unknown }).default ?? mod;
        return [id, data];
      }),
    ),
  );
  const ids = await provider.list();
  const out: { id: string; name: string; data: MazeData }[] = [];
  for (const id of ids) {
    const m = await provider.load(id);
    out.push({ id: m.id, name: m.name, data: m });
  }
  return out;
}

export function App() {
  const [uiScreen, setUiScreen] = useState<UiScreen>('menu');
  const [levels, setLevels] = useState<{ id: string; name: string; data: MazeData }[]>([]);
  const [activeMaze, setActiveMaze] = useState<MazeData | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const gameScreen = useGameStore((s) => s.screen);

  useEffect(() => {
    loadAllLevels().then(setLevels).catch((e) => console.error('Failed to load levels', e));
  }, []);

  const startLevel = (id: string) => {
    const lv = levels.find((l) => l.id === id);
    if (!lv) return;
    useGameStore.getState().startLevel(lv.data);
    setActiveMaze(lv.data);
    if (uiScreen === 'game') setRetryCount((c) => c + 1); // force GameCanvas remount on retry
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
        <GameCanvas key={`${activeMaze.id}-${retryCount}`} maze={activeMaze} />
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
          onPick={startLevel}
          onBack={() => setUiScreen('menu')}
        />
      )}
      {uiScreen === 'settings' && <Settings onBack={() => setUiScreen('menu')} />}
    </div>
  );
}
