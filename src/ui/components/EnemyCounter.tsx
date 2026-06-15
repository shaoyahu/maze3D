import { useGameStore } from '../../store/gameStore';
import { ENEMY_COUNT_MAX } from '../../maze/types';
import { useT } from '../../i18n';

export function EnemyCounter() {
  const mode = useGameStore((s) => s.currentMode);
  const current = useGameStore((s) => s.currentEnemyCount);
  const t = useT();
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
      {t('hud.enemyCount', { current, max: ENEMY_COUNT_MAX })}
    </div>
  );
}