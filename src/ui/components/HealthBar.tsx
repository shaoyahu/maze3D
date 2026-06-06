export function HealthBar({ health, max }: { health: number; max: number }) {
  const hearts = Array.from({ length: max }, (_, i) => i < health);
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 6 }}>
      {hearts.map((filled, i) => (
        <span key={i} style={{ fontSize: 24, color: filled ? 'var(--danger)' : 'var(--border)' }}>
          {filled ? '❤' : '♡'}
        </span>
      ))}
    </div>
  );
}
