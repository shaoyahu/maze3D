import { useEffect, useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { Button } from './components/Button';
import { Settings } from './Settings';
import { formatTime } from '../utils/time';
import { useT } from '../i18n';

const PAUSE_BTN_WIDTH = 240;

// Dark-glass card pattern matching WinOverlay (WinOverlay was the first
// overlay redone with this treatment). The scrim is a radial gradient
// + backdrop blur; the card sits as a dark glass panel with rounded
// corners and a top accent bar. The pause state is "neutral / informational"
// so the accent uses the cool cyan→blue gradient — pause is neither
// success nor failure.
export function PauseOverlay({ onResume, onQuit }: { onResume: () => void; onQuit: () => void; }) {
  const t = useT();
  const pickupCount = useGameStore((s) => s.pickupCount);
  const currentLevelId = useGameStore((s) => s.currentLevelId);
  const best = useLevelStore((s) => (currentLevelId ? s.bestByLevel[currentLevelId] : undefined));
  const [showSettings, setShowSettings] = useState(false);

  // F-2026-06-18-design: entrance animation. Mirrors WinOverlay's
  // `entered` flag pattern so the three overlays (Win / Pause / GameOver)
  // feel like a single design family.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  if (showSettings) {
    return (
      <div style={scrimStyle} data-testid="pause-scrim">
        <Settings onBack={() => setShowSettings(false)} />
      </div>
    );
  }

  return (
    <div style={scrimStyle} data-testid="pause-scrim">
      <div
        style={{
          ...cardStyle,
          transform: entered ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.98)',
          opacity: entered ? 1 : 0,
        }}
        data-testid="pause-overlay"
      >
        <div style={accentBarStyle} aria-hidden />
        <div style={iconStyle} aria-hidden>⏸</div>
        <h2 style={titleStyle} data-testid="pause-title">
          {t('overlays.pause.title')}
        </h2>
        <p style={subtitleStyle}>{t('overlays.pause.collected', pickupCount)}</p>
        {best && (
          <p style={subtitleStyle}>
            {t('overlays.pause.best', { time: formatTime(best.timeUsed) })}
          </p>
        )}

        <div style={buttonRowStyle}>
          <Button
            onClick={onResume}
            hoverStyle="lift"
            width={PAUSE_BTN_WIDTH}
            data-testid="pause-resume"
          >
            {t('overlays.pause.resume')}
          </Button>
          <Button
            onClick={() => setShowSettings(true)}
            variant="secondary"
            hoverStyle="glow"
            width={PAUSE_BTN_WIDTH}
            data-testid="pause-settings"
          >
            {t('overlays.pause.settings')}
          </Button>
          <Button
            onClick={onQuit}
            variant="danger"
            hoverStyle="fade"
            width={PAUSE_BTN_WIDTH}
            data-testid="pause-quit"
          >
            {t('overlays.pause.backToMenu')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────── styles ────────────────────────
//
// Shared dark-glass palette with WinOverlay + GameOverOverlay. Keeping
// the three overlays visually aligned makes the win / pause / game-over
// transitions feel like the same UI family rather than three ad-hoc
// modals. The keyframes block is appended to <head> once; WinOverlay
// already injects its own keyframes (win-scrim-in etc.) so we guard
// here on a different id to avoid duplicate CSS.

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

// Pause uses a cool cyan→blue gradient — informational, neither win nor
// fail. Compared to the red→pink GameOverOverlay bar and the orange→red
// WinOverlay bar, this is the cool sibling.
const accentBarStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 24,
  right: 24,
  height: 3,
  borderRadius: '0 0 3px 3px',
  background: 'linear-gradient(90deg, transparent 0%, #4ec5ff 50%, transparent 100%)',
};

const iconStyle: CSSProperties = {
  fontSize: 56,
  lineHeight: 1,
  marginBottom: 8,
  filter: 'drop-shadow(0 4px 12px rgba(78, 197, 255, 0.35))',
  animation: 'overlay-icon-pop 480ms cubic-bezier(0.2, 0.8, 0.2, 1) 80ms both',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 32,
  fontWeight: 800,
  letterSpacing: '0.02em',
  // Cool gradient mirrors the accent bar; readable on the dark glass
  // card regardless of the underlying scene (paused scene is fully
  // visible behind the scrim, so the title needs to be unambiguous).
  background: 'linear-gradient(180deg, #ffffff 0%, #c5e8ff 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

const subtitleStyle: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 14,
  color: 'rgba(232, 234, 240, 0.85)',
  fontWeight: 400,
};

const buttonRowStyle: CSSProperties = {
  marginTop: 24,
  display: 'flex',
  flexDirection: 'column',
  // F-2026-06-18-design: center the fixed-width buttons inside the
  // card. The previous `stretch` left them flush-left because the
  // explicit `width: 240px` on each Button overrides stretch and
  // alignItems defaulted to `flex-start` for fixed-width children.
  alignItems: 'center',
  gap: 10,
  width: '100%',
};

if (typeof document !== 'undefined' && !document.getElementById('pause-overlay-styles')) {
  const style = document.createElement('style');
  style.id = 'pause-overlay-styles';
  style.textContent = `
    @keyframes overlay-scrim-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes overlay-icon-pop {
      0%   { transform: scale(0.6) rotate(-4deg); opacity: 0; }
      60%  { transform: scale(1.08) rotate(2deg); opacity: 1; }
      100% { transform: scale(1) rotate(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}