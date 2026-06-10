import { useGameStore } from '../../store/gameStore';

export function HealthBar({ health, max }: { health: number; max: number }) {
  const invulnerableUntil = useGameStore((s) => s.invulnerableUntil);
  // P2-4a F4: subscribe to the monotonic hit counter and use it as the
  // element key + data attribute. When a second enemy contact lands inside
  // the 0.5s invulnerable window, invulnerableUntil/elapsedTime change
  // only slightly, so without this React would re-render with the same
  // className and the CSS flash animation would stay stuck on its first
  // frame. Bumping the key on every hit forces a fresh mount, which
  // restarts the animation. The data attribute is also exposed so the
  // re-mount is observable in tests.
  //
  // F1 (fix): compare invulnerableUntil against wall-clock (Date.now()/1000),
  // not elapsedTime. invulnerableUntil is in wall-clock seconds so a
  // backgrounded tab's throttled rAF can't freeze the invulnerability
  // window; comparing against elapsedTime (game-time) was always true
  // and left the flashing class pinned on.
  const hitCount = useGameStore((s) => s.hitCount);
  const flashing = invulnerableUntil > Date.now() / 1000;
  const hearts = Array.from({ length: max }, (_, i) => i < health);
  return (
    <div
      key={hitCount}
      data-testid="health-bar"
      data-hit-count={hitCount}
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
