import { useGameStore } from '../../store/gameStore';

export function HealthBar({ health, max }: { health: number; max: number }) {
  const invulnerableUntil = useGameStore((s) => s.invulnerableUntil);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const flashing = invulnerableUntil > elapsedTime;
  const hearts = Array.from({ length: max }, (_, i) => i < health);
  return (
    <div
      data-testid="health-bar"
      className={flashing ? 'health-bar--flashing' : ''}
      style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 6 }}
    >
      {hearts.map((filled, i) => (
        <span
          key={i}
          style={{ fontSize: 24, color: filled ? 'var(--danger)' : 'var(--border)' }}
        >
          {filled ? '❤' : '♡'}
        </span>
      ))}
    </div>
  );
}
