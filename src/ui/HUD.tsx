import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../i18n';
import { Timer } from './components/Timer';
import { HealthBar } from './components/HealthBar';
import { InventoryBar } from './components/InventoryBar';
import { ControlHints } from './components/ControlHints';
import { EnemyCounter } from './components/EnemyCounter';
import { InvulnerableFlash } from './components/InvulnerableFlash';

// F-2026-06-30: P2-16 — small inline hint that surfaces the M-key
// binding for levels with the parchment map. Rendered as a sibling
// of the existing ControlHints (which lists WASD / P / 1 / 2 / Tab)
// so the binding discovery follows the same pattern. The component
// is intentionally tiny (no separate file) — there's no behavior to
// unit-test beyond "it shows up when minimapMode is parchment".
//
// F-2026-07-01-FCR-L-6: memoize — HUD parent re-renders on every tick and
// MapHint reads only a single string from the store.
const MapHint = React.memo(function MapHint(): React.ReactElement | null {
  const t = useT();
  const minimapMode = useGameStore((s) => s.currentMaze?.rules.minimapMode);
  if (minimapMode !== 'parchment') return null;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 96,
        right: 16,
        background: 'rgba(20, 20, 28, 0.85)',
        color: 'var(--text, #e6e6e6)',
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 12,
        fontFamily: 'system-ui, sans-serif',
        pointerEvents: 'none',
        zIndex: 5,
      }}
      data-testid="hud-map-hint"
    >
      {t('overlays.parchment.hint')}
    </div>
  );
});

// P3-1: §6.1 HUD — `LevelIndicator` shows the player's current
// layer as a compact chip ("L1 / L2 / L3 / L4 / L5 / L6"). The
// engine's layer is 0-indexed (level 0 = bottom), the UI label is
// 1-indexed ("L1" = level 0) so the user-visible numbering matches
// the spec's "L1 / L2 / ..." convention. The component:
//   - subscribes to `useGameStore(s => s.player?.currentLevel ?? 0)`,
//     which the engine pushes via `GameBridge.onLevelChange` (see
//     GameCanvas's bridge wiring);
//   - flashes opacity 0.5 → 1.0 over 0.2s on every level flip
//     (spec §6.1 visual feedback requirement);
//   - uses `hud.levelIndicator.label` (full "Level 1") as the
//     aria-label / title so screen readers / hover-tooltips get
//     the long form, while the visible text is `hud.levelIndicator.short`
//     ("L1") — matching the LevelSelect dropdown's compact "L{N}"
//     badge so the two surfaces don't drift in styling.
//
// React.memo: HUD re-renders on every game-store tick (per the
// Timer / HealthBar / InventoryBar / EnemyCounter siblings); the
// indicator only needs to re-render when `currentLevel` changes.
const FLASH_HALF_MS = 100; // spec says 0.2s total (half = 100ms)
const FLASH_DIM = 0.5;
const FLASH_FULL = 1.0;

const LevelIndicator = React.memo(function LevelIndicator(): React.ReactElement {
  const t = useT();
  const currentLevel = useGameStore((s) => s.player?.currentLevel ?? 0);
  // `flash` toggles between DIM and FULL. We start FULL; on every
  // level flip the effect drops to DIM for FLASH_HALF_MS then
  // transitions back to FULL via the CSS `transition` below. The
  // prev-level ref is the change detector: a fresh effect run
  // with the same `currentLevel` (e.g. parent re-render with no
  // engine push) is a no-op so the indicator never flashes
  // spuriously.
  const [opacity, setOpacity] = useState<number>(FLASH_FULL);
  const prevLevelRef = useRef<number>(currentLevel);
  useEffect(() => {
    if (prevLevelRef.current === currentLevel) return;
    prevLevelRef.current = currentLevel;
    setOpacity(FLASH_DIM);
    const id = window.setTimeout(() => setOpacity(FLASH_FULL), FLASH_HALF_MS);
    return () => window.clearTimeout(id);
  }, [currentLevel]);
  return (
    <div
      title={t('hud.levelIndicator.label', { level: currentLevel + 1 })}
      aria-label={t('hud.levelIndicator.label', { level: currentLevel + 1 })}
      data-testid="hud-level-indicator"
      data-level={currentLevel}
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        background: 'rgba(20, 20, 28, 0.85)',
        color: 'var(--text, #e6e6e6)',
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'system-ui, sans-serif',
        pointerEvents: 'none',
        zIndex: 5,
        opacity,
        // CSS transition covers the 0.5 → 1.0 half of the flash
        // (the effect above flips state to FULL; the browser
        // interpolates the rest). `linear` matches the
        // instant-ish feel of a level change — a soft ease would
        // feel sluggish on a 100ms window.
        transition: 'opacity 0.1s linear',
      }}
    >
      {t('hud.levelIndicator.short', { level: currentLevel + 1 })}
    </div>
  );
});
LevelIndicator.displayName = 'LevelIndicator';

export function HUD() {
  const timeRemaining = useGameStore((s) => s.timeRemaining);
  const health = useGameStore((s) => s.health);
  const inventory = useGameStore((s) => s.inventory);
  const maxHealth = useGameStore((s) => s.currentMaze?.rules.maxHealth ?? 3);
  // F3: survive mode is "how long can you last" — the timer must show the
  // REMAINING time, not the (constant) timeRemaining seed. Without this
  // branch the survive countdown never ticks down and the HUD looks
  // broken. reach-exit / time-trial keep using timeRemaining unchanged.
  const currentMode = useGameStore((s) => s.currentMode);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const currentSurviveSeconds = useGameStore((s) => s.currentSurviveSeconds);
  const displaySeconds = currentMode === 'survive'
    ? Math.max(0, currentSurviveSeconds - elapsedTime)
    : timeRemaining;
  const urgent = displaySeconds <= 10;
  return (
    <>
      <Timer seconds={displaySeconds} urgent={urgent} />
      <ControlHints />
      <InventoryBar slots={inventory} />
      <HealthBar health={health} max={maxHealth} />
      <EnemyCounter />
      <InvulnerableFlash />
      <MapHint />
      <LevelIndicator />
    </>
  );
}
