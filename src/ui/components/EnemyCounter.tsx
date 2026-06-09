import { useGameStore } from '../../store/gameStore';
import { ENEMY_COUNT_MAX } from '../../maze/types';

export function EnemyCounter() {
  const current = useGameStore((s) => s.progressiveEnemyCount);
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
