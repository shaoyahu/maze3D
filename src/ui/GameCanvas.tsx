import { useEffect, useRef, useState } from 'react';
import { Game, type GameBridge } from '../engine/Game';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTutorialStore } from '../store/tutorialStore';
import { validateTutorialSteps } from '../utils/tutorialValidator';
import { Crosshair } from './components/Crosshair';
import { Minimap } from './components/Minimap';
import type { MazeData, StartLevelOptions } from '../maze/types';
import { useT } from '../i18n';

export function GameCanvas({ maze, options }: { maze: MazeData; options?: StartLevelOptions }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  // The crosshair is a gameplay cue — hide it the moment the screen is no
  // longer "playing" (paused / game-over / win) so it doesn't poke through
  // the semi-transparent overlay backgrounds and compete for focus.
  const screen = useGameStore((s) => s.screen);
  // When pointer lock is denied (permissions policy, non-secure context,
  // sandboxed iframe, or user dismissed the prompt), show a brief on-screen
  // message so the user knows mouselook won't work. F-N9: track the
  // dismiss timer in a ref so the cleanup function (unmount or rapid
  // re-click) can clear it. Without the ref, switching screens within
  // 3s of an error fires setPointerLockError(null) on an unmounted
  // component (React 18 warning).
  const [pointerLockError, setPointerLockError] = useState<string | null>(null);
  const pointerLockTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (pointerLockTimerRef.current !== null) {
      window.clearTimeout(pointerLockTimerRef.current);
      pointerLockTimerRef.current = null;
    }
  }, []);

  // Effect 1: create the Game instance once and wire up window/document
  // listeners. The Game's renderer, input manager, and store subscriptions
  // are created here. On unmount, everything is torn down.
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
      onReachExit: () => {
        const s = useGameStore.getState();
        // Guard against the win/lose race: if the timer hit 0 earlier in
        // this same frame, the tick already flipped screen to 'game-over'.
        // Recording a 'best' for a lost run would silently corrupt the
        // leaderboard, so bail before touching levelStore.
        if (s.screen !== 'playing') {
          s.reachExit(false);
          return;
        }
        if (!s.currentLevelId || !s.currentMaze) {
          s.reachExit(false);
          return;
        }
        // tick only runs while screen === 'playing', so elapsedTime is wall time
        // minus pauses — the metric the leaderboard should record.
        const candidate = {
          levelId: s.currentLevelId,
          timeUsed: s.elapsedTime,
          collected: s.pickupCount.collected,
          total: s.pickupCount.total,
          date: new Date().toISOString(),
        };
        const isNewRecord = useLevelStore.getState().peekIsBetter(candidate);
        if (isNewRecord) {
          useLevelStore.getState().record(candidate);
        }
        s.reachExit(isNewRecord);
      },
      // Q3 / DoD §14.2: Game.ts is store-free. These accessors let the engine
      // read settings + game state without importing any store itself.
      getInitialFov: () => useSettingsStore.getState().fov,
      getInitialPointerSensitivity: () => useSettingsStore.getState().pointerSensitivity,
      getCurrentDarkMode: () => useSettingsStore.getState().darkMode,
      getCurrentEnemyAggression: () => useSettingsStore.getState().enemyAggression,
      isActiveLevel: (levelId) => useGameStore.getState().currentLevelId === levelId,
      isPlaying: () => useGameStore.getState().screen === 'playing',
      onUseItem: (slot) => useGameStore.getState().useItem(slot),
      // P2-4a F1: forward every per-frame enemy contact to the store's
      // damage action. The store owns the 0.5s invulnerability window
      // (see gameStore.damage), so calling this every frame the player
      // overlaps an enemy is safe — repeat hits inside the window
      // collapse into hitCount-only no-ops, letting the HealthBar /
      // InvulnerableFlash UI still re-trigger their flash animation
      // without dropping health a second time.
      onEnemyContact: (n) => useGameStore.getState().damage(n, undefined, 'enemy'),
    };
    const game = new Game(bridge);
    game.init(ref.current);
    gameRef.current = game;
    // Dev-only escape hatch: lets a human poke at the live engine from the
    // browser console to debug spatial bugs (e.g. "why is the player marker
    // offset from the camera?"). Not exposed in production builds.
    if (import.meta.env.DEV) {
      (window as unknown as { __game: Game }).__game = game;
    }

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
  }, []);

  // Effect 2: (re)start the level whenever the maze changes or the store
  // signals a restart. Calling game.startLevel on the live instance is
  // cheaper than remounting the whole component (which would tear down the
  // renderer, WebGL context, listeners, and reupload textures). The
  // restartKey dependency handles retries on the same level — maze.id
  // alone wouldn't change.
  const restartKey = useGameStore((s) => s.restartKey);
  // F-M3: keep the latest `options` in a ref and drop it from the deps
  // array. App.tsx currently stores activeOptions in useState (stable
  // reference) so this doesn't fire today, but listing `options` here
  // turns any future refactor that returns a new options object on every
  // render (e.g. inline `{ ... }` in App.startLevel) into a full
  // disposeScene+buildScene+rebuild-all-enemies per render. Ref pattern
  // is the robust fix.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    if (gameRef.current) {
      // P2-3: forward the StartLevelOptions (mode + seed) so the engine
      // can snapshot the mode via getCurrentMode() for HUD/UI consumers.
      // The store has already been seeded by App.tsx; we don't call
      // store.startLevel here to avoid double-seeding.
      gameRef.current.startLevel(maze, optionsRef.current);
      // P2-11: start the tutorial store with this level's steps (if any).
      // Production levels without `tutorialSteps` get `[]` and the banner
      // stays hidden. Steps are validated; invalid input is silently dropped
      // (the validator returns `ok: false` and we just don't start).
      const validation = validateTutorialSteps(maze.tutorialSteps);
      if (validation.ok) {
        useTutorialStore.getState().start(validation.steps);
      } else {
        useTutorialStore.getState().reset();
      }
    }
    // gameRef.current is set by Effect 1 before Effect 2 runs (declaration order).
  }, [maze.id, restartKey]);

  useEffect(() => {
    // Subscriptions read gameRef.current lazily so they survive a level
    // change (the init effect re-runs on [maze.id]; this one runs once).
    const unsubStore = useGameStore.subscribe((s, prev) => {
      if (s.screen === 'paused' && prev && prev.screen !== 'paused') {
        gameRef.current?.pauseLoop();
        gameRef.current?.setInputPaused(true);
        // Release the pointer so the user can interact with the pause
        // overlay (settings, retry, quit) without having to press Esc.
        if (document.pointerLockElement) document.exitPointerLock();
      }
      if (s.screen === 'playing' && prev && prev.screen === 'paused') {
        gameRef.current?.resumeLoop();
        gameRef.current?.setInputPaused(false);
      }
      // On terminal screens (win / game-over) the user needs the cursor
      // back to click the overlay buttons ("重玩" / "返回主菜单"). Without
      // this they would have to press Esc first — annoying after a win.
      if ((s.screen === 'win' || s.screen === 'game-over') && document.pointerLockElement) {
        document.exitPointerLock();
      }
    });
    const unsubSettings = useSettingsStore.subscribe((s, prev) => {
      // F-L7: Zustand subscribe 订阅时立即 fire 一次 listener, prev=undefined。
      // 守卫跳过首次调用,避免对 0.002/60/false 初始值无意义地调用
      // setSensitivity / setFov / setDarkMode(无功能影响,仅浪费一次调用)。
      if (!prev) return;
      if (s.pointerSensitivity !== prev.pointerSensitivity) {
        gameRef.current?.setSensitivity(s.pointerSensitivity);
      }
      if (s.fov !== prev.fov) {
        gameRef.current?.setFov(s.fov);
      }
      if (s.darkMode !== prev.darkMode) {
        gameRef.current?.setDarkMode(s.darkMode);
      }
    });
    return () => { unsubStore(); unsubSettings(); };
  }, []);

  return (
    <>
      {/* width/height: 100% forces the canvas's CSS box to match the parent.
          Without it, some browsers (notably macOS Safari + some Chrome
          versions) use the canvas's intrinsic size (set from
          renderer.setSize → canvas.width/height attributes) as the CSS size,
          which on a HiDPI display is parent×DPR. The result: the canvas
          overflows the viewport, the bottom-right quadrant gets clipped, and
          any 3D content drawn at canvas-NDC (0, 0) appears in the visible
          viewport's bottom-right corner instead of the center. */}
      <canvas ref={ref} onClick={() => {
        // F-2026-06-15-H-3.9: requestPointerLock now resolves with
        // { ok: boolean } instead of throwing. Branch on .ok so the
        // failure UX (toast + auto-clear) is explicit rather than
        // hidden in a .catch(...).
        void gameRef.current?.requestPointerLock().then((r) => {
          if (r.ok) return;
          setPointerLockError(t('app.error.pointerLockFailed'));
          if (pointerLockTimerRef.current !== null) {
            window.clearTimeout(pointerLockTimerRef.current);
          }
          pointerLockTimerRef.current = window.setTimeout(() => {
            setPointerLockError(null);
            pointerLockTimerRef.current = null;
          }, 3000);
        });
      }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {screen === 'playing' && <Crosshair />}
      {screen === 'playing' && <Minimap maze={maze} gameRef={gameRef} />}
      {pointerLockError && (
        <div role="alert" style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(20, 20, 28, 0.92)', color: 'var(--danger)',
          padding: '8px 16px', borderRadius: 4, fontSize: 14, zIndex: 10,
          border: '1px solid var(--danger)',
        }}>
          {pointerLockError}
        </div>
      )}
    </>
  );
}
