import * as React from 'react';
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
    </>
  );
}
