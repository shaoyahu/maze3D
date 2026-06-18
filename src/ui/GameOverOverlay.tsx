import { useEffect, useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { Button } from './components/Button';
import { formatTime } from '../utils/time';
import { useT } from '../i18n';
import type { VictoryType } from '../maze/types';

// F-2026-06-17-L-4: Record<VictoryType, string> instead of isSurvive ternary.
// A 5th VictoryType will now force a compile error here until mapped, instead
// of silently falling through to the non-survive branch. `reach-exit` and
// `caught-by-enemy` don't normally trigger the game-over overlay; they map
// to titleTimeTrial as a defensive default — same effective behavior as the
// previous ternary, just exhaustive at the type level.
const GAMEOVER_TITLE_KEYS: Record<VictoryType, string> = {
  'reach-exit': 'overlays.gameOver.titleTimeTrial',
  'time-trial': 'overlays.gameOver.titleTimeTrial',
  survive: 'overlays.gameOver.titleSurvive',
  'caught-by-enemy': 'overlays.gameOver.titleTimeTrial',
};

// Dark-glass card pattern matching WinOverlay + PauseOverlay. The
// previous version floated red `<h2>` text directly on top of the
// scene (`color: var(--danger)`), which clashed with red brick walls
// and other warm-toned scene elements — the title was unreadable. The
// card lifts the content out of the scene into a controlled dark
// surface so the title color no longer fights the background. The
// accent bar uses a soft red→pink gradient (not the bright danger red
// token) so it reads as "end-of-run" without screaming.
export function GameOverOverlay({ onRetry, onQuit }: { onRetry: () => void; onQuit: () => void; }) {
  const t = useT();
  const currentMode = useGameStore((s) => s.currentMode);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const collected = useGameStore((s) => s.pickupCount.collected);
  const isSurvive = currentMode === 'survive';

  // F-2026-06-18-design: entrance animation. See WinOverlay / PauseOverlay
  // for the rationale — three overlays sharing the same family of motion
  // (scrim fade-in + card slide-up + icon pop) feels intentional.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div style={scrimStyle} data-testid="game-over-scrim">
      <div
        style={{
          ...cardStyle,
          transform: entered ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.98)',
          opacity: entered ? 1 : 0,
        }}
        data-testid="game-over-overlay"
      >
        <div style={accentBarStyle} aria-hidden />
        <div style={iconStyle} aria-hidden>💀</div>
        <h2 style={titleStyle} data-testid="game-over-title">
          {t(GAMEOVER_TITLE_KEYS[currentMode])}
        </h2>
        {isSurvive && (
          <>
            <p style={statStyle}>{t('overlays.gameOver.survived', { time: formatTime(elapsedTime) })}</p>
            <p style={statStyle}>{t('overlays.gameOver.hitCount', { count: collected })}</p>
          </>
        )}

        <div style={buttonRowStyle}>
          <Button
            onClick={onRetry}
            hoverStyle="lift"
            width={PAUSE_BTN_WIDTH}
            data-testid="game-over-retry"
          >
            {t('overlays.gameOver.retry')}
          </Button>
          <Button
            onClick={onQuit}
            variant="secondary"
            hoverStyle="fade"
            width={PAUSE_BTN_WIDTH}
            data-testid="game-over-quit"
          >
            {t('overlays.gameOver.backToMenu')}
          </Button>
        </div>
      </div>
    </div>
  );
}

const PAUSE_BTN_WIDTH = 240;

// ──────────────────────── styles ────────────────────────
//
// Same dark-glass scrim/card geometry as WinOverlay + PauseOverlay. Only
// the accent bar + title gradient + icon differ — those carry the
// "game over" semantics without re-introducing the bright `--danger`
// text that was unreadable on red scene backgrounds.

const scrimStyle: CSSProperties = {
  position: 'absolute', inset: 0,
  background:
    'radial-gradient(ellipse at center, rgba(8,10,16,0.78) 0%, rgba(8,10,16,0.94) 100%)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 50,
  animation: 'overlay-scrim-in 240ms ease-out',
};

const cardStyle: CSSProperties = {
  position: 'relative',
  width: 'min(440px, 100%)',
  background: 'linear-gradient(180deg, rgba(28,32,42,0.96) 0%, rgba(18,21,28,0.96) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  padding: '32px 32px 24px',
  boxShadow:
    '0 20px 60px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset',
  color: 'var(--fg)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  transition: 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 320ms ease-out',
};

// Soft red→pink. The previous version used `color: var(--danger)` on
// the title text directly, which clashed with red brick walls and was
// unreadable. A gradient inside the dark glass card is fully readable
// while still signalling "end of run" — distinct from WinOverlay's
// orange/red gradient (success) and PauseOverlay's cyan/blue (neutral).
const accentBarStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 24,
  right: 24,
  height: 3,
  borderRadius: '0 0 3px 3px',
  background: 'linear-gradient(90deg, transparent 0%, #ff5e7e 50%, transparent 100%)',
};

const iconStyle: CSSProperties = {
  fontSize: 56,
  lineHeight: 1,
  marginBottom: 8,
  filter: 'drop-shadow(0 4px 12px rgba(255, 94, 126, 0.35))',
  animation: 'overlay-icon-pop 480ms cubic-bezier(0.2, 0.8, 0.2, 1) 80ms both',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 32,
  fontWeight: 800,
  letterSpacing: '0.02em',
  // Soft red→pink gradient. Distinct from WinOverlay's orange→gold
  // success gradient and PauseOverlay's cool cyan→blue neutral
  // gradient. The dark glass card guarantees ≥7:1 contrast for the
  // top of the gradient (white) and ≥4.5:1 for the bottom (pink on
  // dark gray) regardless of the underlying scene.
  background: 'linear-gradient(180deg, #ffffff 0%, #ffb0c0 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

const statStyle: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 15,
  color: 'rgba(232, 234, 240, 0.85)',
  fontWeight: 500,
};

const buttonRowStyle: CSSProperties = {
  marginTop: 24,
  display: 'flex',
  flexDirection: 'column',
  // F-2026-06-18-design: center the fixed-width buttons inside the
  // card (same rationale as PauseOverlay). `stretch` left them
  // flush-left because each Button has an explicit `width: 240px`
  // which overrides the stretch hint.
  alignItems: 'center',
  gap: 10,
  width: '100%',
};