import { useGameStore } from '../../store/gameStore';

// Full-screen red overlay rendered while the player is in the 0.5s
// invulnerable window after taking a hit. pointerEvents: none so the
// overlay doesn't intercept clicks meant for the canvas. The fade-out
// animation is defined in theme.css; the 0.5s duration matches the
// ENEMY_INVULNERABLE_SECONDS contract.
//
// P2-4a F4 / F10 (fix): `invulnerableUntil` is set by gameStore.damage to
// wall-clock seconds (Date.now()/1000 + 0.5) so a backgrounded tab's
// throttled rAF can't freeze the invulnerability window. We compare
// against the current wall-clock — the previous code compared against
// `elapsedTime` (game-time seconds), which made the condition always
// true and left the overlay mounted forever after the first hit.
//
// The component re-renders only when `invulnerableUntil` or `hitCount`
// changes; the CSS animation is one-shot (0.5s linear forwards), so
// after the window expires the div stays in the DOM at opacity 0. The
// next hit bumps hitCount, the key={hitCount} re-mounts the element,
// and the animation restarts.
export function InvulnerableFlash() {
  const invulnerableUntil = useGameStore((s) => s.invulnerableUntil);
  const hitCount = useGameStore((s) => s.hitCount);
  const active = invulnerableUntil > Date.now() / 1000;
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
