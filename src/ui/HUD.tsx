import { useGameStore } from '../store/gameStore';
import { Timer } from './components/Timer';
import { HealthBar } from './components/HealthBar';
import { InventoryBar } from './components/InventoryBar';
import { ControlHints } from './components/ControlHints';
import { EnemyCounter } from './components/EnemyCounter';
import { InvulnerableFlash } from './components/InvulnerableFlash';

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
    </>
  );
}
