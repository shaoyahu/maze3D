import { useGameStore } from '../../store/gameStore';

// Full-screen red overlay rendered while the player is in the 0.5s
// invulnerable window after taking a hit. pointerEvents: none so the
// overlay doesn't intercept clicks meant for the canvas. The fade-out
// animation is defined in theme.css; the 0.5s duration matches the
// ENEMY_INVULNERABLE_SECONDS contract, so by the time the animation
// finishes the store has already moved `invulnerableUntil` into the
// past and the next render returns null — no flicker, no manual timer.
export function InvulnerableFlash() {
  const invulnerableUntil = useGameStore((s) => s.invulnerableUntil);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const active = invulnerableUntil > elapsedTime;
  if (!active) return null;
  return (
    <div
      data-testid="invulnerable-flash"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(255, 50, 50, 0.25)',
        pointerEvents: 'none',
        animation: 'invulnerable-fade 0.5s linear forwards',
      }}
    />
  );
}
