import { useGameStore } from '../../store/gameStore';
import { ENEMY_COUNT_MAX } from '../../maze/types';

export function EnemyCounter() {
  // F9: subscribe to currentEnemyCount, the actual count of enemies
  // startLevel put into the scene (hand-crafted + injected). The previous
  // source (progressiveEnemyCount) is a spawn-event tally, not a scene
  // count — it kept incrementing every time the scheduler fired while
  // the scene itself never grew new meshes, so the HUD number drifted
  // from reality.
  const current = useGameStore((s) => s.currentEnemyCount);
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
