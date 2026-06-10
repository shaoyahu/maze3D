import { useGameStore } from '../../store/gameStore';

// Full-screen red overlay rendered while the player is in the 0.5s
// invulnerable window after taking a hit. pointerEvents: none so the
// overlay doesn't intercept clicks meant for the canvas. The fade-out
// animation is defined in theme.css; the 0.5s duration matches the
// ENEMY_INVULNERABLE_SECONDS contract, so by the time the animation
// finishes the store has already moved `invulnerableUntil` into the
// past and the next render returns null — no flicker, no manual timer.
//
// P2-4a F4 / F10: hitCount is the monotonic counter store.damage() bumps
// on every enemy contact, even when the call is absorbed by the 0.5s
// invulnerable window. Using it as the element key (and exposing it via
// data-hit-count) forces a fresh mount on every contact, which restarts
// the CSS fade animation. Without this, a second hit inside the same
// window would re-render with the same props and the animation would
// stay stuck on its first frame.
export function InvulnerableFlash() {
  const invulnerableUntil = useGameStore((s) => s.invulnerableUntil);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const hitCount = useGameStore((s) => s.hitCount);
  const active = invulnerableUntil > elapsedTime;
  if (!active) return null;
  return (
    <div
      key={hitCount}
      data-testid="invulnerable-flash"
      data-hit-count={hitCount}
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
