// P3-3: Full-screen red vignette overlay rendered during the 0.5s
// pre-transition warning for `hole-down`. Mirrors the
// InvulnerableFlash pattern (P2-4a) with three deltas:
//
//   1. Wall-clock timestamp source: `warningFlashUntil` (set by
//      the bridge from Game.startWarningFlash). 0 = not flashing.
//   2. Re-mount key: `warningFlashTriggerId` (bumped on every
//      new warning). React's key prop re-mounts the div, which
//      restarts the CSS animation. Without this, a second
//      warning landing inside the first overlay's 0.5s window
//      would inherit the partial animation state and look
//      wrong.
//   3. Visual: deeper red (rgba 255,30,30) at 0.3 opacity —
//      InvulnerableFlash uses (255,50,50) at 0.25 because the
//      post-hit invulnerability window is a known state, while
//      a hole-down warning is a "you're about to fall" alert
//      that warrants a heavier tint.
//
// P3-3: `pointer-events: none` so the overlay never intercepts
// clicks meant for the canvas (matches InvulnerableFlash). The
// CSS animation is `invulnerable-fade 0.5s linear forwards` (the
// 0% opacity 1 → 100% opacity 0 keyframe already exists in
// theme.css from P2-4a) — P3-3 deliberately reuses the same
// keyframe rather than introducing a new one.
import { useGameStore } from '../../store/gameStore';

export function WarningFlashOverlay() {
  const warningFlashUntil = useGameStore((s) => s.warningFlashUntil);
  const warningFlashTriggerId = useGameStore((s) => s.warningFlashTriggerId);
  // F-2026-06-17-B-F-2 (mirror): wall-clock compare, not game-time
  // (elapsedTime). A backgrounded tab's throttled rAF can't pin
  // the overlay on screen; the wall-clock advances regardless of
  // tab visibility. The InvulnerableFlash bug this fixes was
  // identical: comparing against `elapsedTime` made the condition
  // always true and the overlay stayed mounted forever.
  const active = warningFlashUntil > Date.now() / 1000;
  if (!active) return null;
  return (
    <div
      // F-P3-3-1: `key={triggerId}` re-mounts on every new warning.
      // The first 0.5s animation completes; a second warning
      // landing before unmount (e.g. another hole-down adjacent
      // to the first) bumps the trigger id, React swaps the
      // element, the CSS animation restarts at 100% opacity.
      key={warningFlashTriggerId}
      data-testid="warning-flash-overlay"
      data-trigger-id={warningFlashTriggerId}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(255, 30, 30, 0.3)',
        pointerEvents: 'none',
        animation: 'invulnerable-fade 0.5s linear forwards',
      }}
    />
  );
}
