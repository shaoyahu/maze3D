import { useGameStore } from '../../store/gameStore';
import { ENEMY_COUNT_MAX } from '../../maze/types';

export function EnemyCounter() {
  // FR-22: hard-hide the counter in non-survive mode. After the
  // P2-5 rebalance, non-survive enemyCount is always 0 (gameStore +
  // Game both gate injectEnemySpawns to mode === 'survive'), so the
  // counter would only ever show '敌人 0 / 10' — pure noise. Subscribing
  // to currentMode + currentEnemyCount ensures the component re-renders
  // both on mode flips AND on survive-mode count changes (progressive
  // spawn scheduler bumps the count; the HUD should track it).
  const mode = useGameStore((s) => s.currentMode);
  const current = useGameStore((s) => s.currentEnemyCount);
  if (mode !== 'survive') return null;
  return (
    <div
      data-testid="enemy-counter"
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        color: 'var(--muted)',
        fontSize: 14,
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      敌人 {current} / {ENEMY_COUNT_MAX}
    </div>
  );
}
