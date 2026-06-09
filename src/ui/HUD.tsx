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
  return (
    <>
      <Timer seconds={timeRemaining} urgent={timeRemaining <= 10} />
      <ControlHints />
      <InventoryBar slots={inventory} />
      <HealthBar health={health} max={maxHealth} />
      <EnemyCounter />
      <InvulnerableFlash />
    </>
  );
}
