import { useEffect, useRef } from 'react';
import { Game, type GameBridge } from '../engine/Game';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import type { MazeData } from '../maze/types';

export function GameCanvas({ maze }: { maze: MazeData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const bridge: GameBridge = {
      onTick: (dt) => useGameStore.getState().tick(dt),
      onPauseToggle: () => {
        const s = useGameStore.getState();
        if (s.screen === 'playing') s.pause();
        else if (s.screen === 'paused') s.resume();
      },
      onPickupCollected: (p) => useGameStore.getState().pickup(p),
      onReachExit: (timeUsed) => {
        const s = useGameStore.getState();
        if (s.currentLevelId) {
          useLevelStore.getState().record({
            levelId: s.currentLevelId,
            timeUsed,
            collected: s.pickupCount.collected,
            total: s.pickupCount.total,
            date: new Date().toISOString(),
          });
        }
        s.reachExit();
      },
    };
    const game = new Game(bridge);
    game.init(ref.current);
    game.startLevel(maze);
    gameRef.current = game;
    const onResize = () => game.resize();
    window.addEventListener('resize', onResize);
    const onVisibility = () => {
      if (document.hidden) useGameStore.getState().pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      game.dispose();
      gameRef.current = null;
    };
  }, [maze.id]);

  useEffect(() => {
    const unsub = useGameStore.subscribe((s, prev) => {
      if (s.screen === 'paused' && prev && prev.screen !== 'paused') gameRef.current?.pauseLoop();
      if (s.screen === 'playing' && prev && prev.screen === 'paused') gameRef.current?.resumeLoop();
    });
    return unsub;
  }, []);

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, display: 'block' }} />;
}
