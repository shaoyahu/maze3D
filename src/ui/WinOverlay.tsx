import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { Button } from './components/Button';
import { formatTime } from '../utils/time';
import { useT } from '../i18n';

export function WinOverlay({
  onRetry,
  onQuit,
  onNext,
  onLevels,
}: {
  onRetry: () => void;
  onQuit: () => void;
  onLevels: () => void;
  onNext?: () => void;
}) {
  const t = useT();
  const pickupCount = useGameStore((s) => s.pickupCount);
  const collected = pickupCount.collected;
  const total = pickupCount.total;
  const currentLevelId = useGameStore((s) => s.currentLevelId);
  const timeUsed = useGameStore((s) => s.elapsedTime);
  const newRecord = useGameStore((s) => s.lastWinIsNewRecord);
  const winKind = useGameStore((s) => s.lastWinKind);
  const best = useLevelStore((s) => (currentLevelId ? s.bestByLevel[currentLevelId] : undefined));
  // P2-11: caught-by-enemy path picks different copy + skips the new-
  // record badge (no timer competition in a chase). The "next" button
  // remains available so the player can advance to the next teaching
  // level without going back to LevelSelect.
  const isCaughtByEnemy = winKind === 'caught-by-enemy';

  // Drive the entrance animation on mount. The card slides up + fades
  // in over 320ms; the stat tiles stagger 60ms after the card so the
  // eye lands on the title first. A simple `entered` boolean is enough
  // — we don't need react-spring for a one-shot overlay animation.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div style={scrimStyle} data-testid="win-overlay-scrim">
      <div
        style={{
          ...cardStyle,
          transform: entered ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.98)',
          opacity: entered ? 1 : 0,
        }}
        data-testid="win-overlay"
      >
        <div style={accentBarStyle} aria-hidden />
        <div style={iconStyle} aria-hidden>{isCaughtByEnemy ? '👁' : '🏆'}</div>
        <h2 style={titleStyle} data-testid="win-title">
          {isCaughtByEnemy ? t('overlays.win.caught.title') : t('overlays.win.title')}
        </h2>
        <p style={subtitleStyle}>
          {isCaughtByEnemy ? t('overlays.win.caught.subtitle') : t('overlays.win.subtitle')}
        </p>

        {newRecord && !isCaughtByEnemy && (
          <div style={recordBadgeStyle} data-testid="win-new-record">
            ✦ {t('overlays.win.newRecord')}
          </div>
        )}

        <div style={statsGridStyle}>
          <StatTile
            label={t('overlays.win.timeUsed', { time: '' }).replace(/[\s\d:]+$/, '').trim() || '用时'}
            value={formatTime(timeUsed)}
            delayMs={120}
            entered={entered}
            tone="primary"
          />
          <StatTile
            label="收集"
            value={`${collected} / ${total}`}
            delayMs={180}
            entered={entered}
            tone="neutral"
          />
          <StatTile
            label="最佳"
            value={best ? formatTime(best.timeUsed) : '—'}
            delayMs={240}
            entered={entered}
            tone="muted"
          />
        </div>

        <div style={actionsRowStyle}>
          <Button onClick={onRetry} data-testid="win-retry">
            ↻ {t('overlays.win.retry')}
          </Button>
          {onNext && (
            <Button onClick={onNext} variant="secondary" data-testid="win-next">
              {t('overlays.win.next')} →
            </Button>
          )}
          <Button onClick={onLevels} variant="secondary" data-testid="win-to-levels">
            {t('overlays.win.toLevels')}
          </Button>
        </div>
        <button
          type="button"
          onClick={onQuit}
          style={menuLinkStyle}
          data-testid="win-back-to-menu"
        >
          {t('overlays.win.backToMenu')}
        </button>
      </div>
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  delayMs: number;
  entered: boolean;
  tone: 'primary' | 'neutral' | 'muted';
}

function StatTile({ label, value, delayMs, entered, tone }: StatTileProps): JSX.Element {
  // Staggered entrance: each tile sits invisible until its delay
  // expires, then fades + lifts into place. Slightly shorter than the
  // card's 320ms so the tiles "land" after the card settles.
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!entered) return;
    const id = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(id);
  }, [entered, delayMs]);

  // F-P2-N readability fix: don't read --fg-muted for the secondary
  // text — on the dark card it lands at ~#8a8f9c on #12151c, a 2:1
  // contrast that's effectively invisible. Hard-code a high-alpha
  // white that pairs with the dark glass card regardless of theme.
  const valueColor =
    tone === 'primary'
      ? 'var(--accent)'
      : tone === 'muted'
        ? 'rgba(232, 234, 240, 0.85)'
        : '#ffffff';

  return (
    <div
      style={{
        ...statTileStyle,
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 220ms ease-out, transform 220ms ease-out',
      }}
    >
      <div style={statLabelStyle}>{label}</div>
      <div style={{ ...statValueStyle, color: valueColor }}>{value}</div>
    </div>
  );
}

// -----------------------------------------------------------------------
// styles
// -----------------------------------------------------------------------

const scrimStyle = {
  position: 'absolute' as const,
  inset: 0,
  background:
    'radial-gradient(ellipse at center, rgba(8,10,16,0.78) 0%, rgba(8,10,16,0.94) 100%)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 50,
  animation: 'win-scrim-in 240ms ease-out',
};

const cardStyle = {
  position: 'relative' as const,
  width: 'min(440px, 100%)',
  background: 'linear-gradient(180deg, rgba(28,32,42,0.96) 0%, rgba(18,21,28,0.96) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  padding: '32px 32px 24px',
  boxShadow:
    '0 20px 60px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset',
  color: 'var(--fg)',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  textAlign: 'center' as const,
  transition: 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 320ms ease-out',
};

const accentBarStyle = {
  position: 'absolute' as const,
  top: 0,
  left: 24,
  right: 24,
  height: 3,
  borderRadius: '0 0 3px 3px',
  background: 'linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)',
};

const iconStyle = {
  fontSize: 56,
  lineHeight: 1,
  marginBottom: 8,
  filter: 'drop-shadow(0 4px 12px rgba(255, 152, 60, 0.35))',
  animation: 'win-icon-pop 480ms cubic-bezier(0.2, 0.8, 0.2, 1) 80ms both',
};

const titleStyle = {
  margin: 0,
  fontSize: 32,
  fontWeight: 800,
  letterSpacing: '0.02em',
  background: 'linear-gradient(180deg, #ffffff 0%, #ffd9a8 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

const subtitleStyle = {
  margin: '4px 0 0',
  fontSize: 14,
  color: 'rgba(232, 234, 240, 0.85)', // ≥ 7:1 against #12151c
  fontWeight: 400,
};

const recordBadgeStyle = {
  marginTop: 16,
  padding: '6px 14px',
  borderRadius: 999,
  background: 'linear-gradient(90deg, #ff9844 0%, #ff5e62 100%)',
  color: '#1a1a1a',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.02em',
  boxShadow: '0 6px 18px rgba(255, 94, 98, 0.35)',
  animation: 'win-record-pulse 1.6s ease-in-out infinite',
};

const statsGridStyle = {
  marginTop: 24,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 10,
  width: '100%',
};

const statTileStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
  padding: '14px 10px',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 4,
};

const statLabelStyle = {
  fontSize: 11,
  color: 'rgba(232, 234, 240, 0.72)', // ≥ 5:1 against #12151c
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

const statValueStyle = {
  fontSize: 22,
  fontWeight: 700,
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  letterSpacing: '0.01em',
};

const actionsRowStyle = {
  marginTop: 28,
  display: 'flex',
  gap: 10,
  width: '100%',
  flexWrap: 'wrap' as const,
  justifyContent: 'center',
};

const menuLinkStyle = {
  marginTop: 14,
  background: 'none',
  border: 'none',
  color: 'rgba(232, 234, 240, 0.78)', // ≥ 6:1 against #12151c
  fontSize: 13,
  cursor: 'pointer',
  padding: '4px 8px',
  fontFamily: 'inherit',
  textDecoration: 'none',
  transition: 'color 160ms ease',
};

// Inject the keyframes once. The string is identical to other overlays
// (GameOverOverlay, PauseOverlay) so a future refactor can move it to
// theme.css — for now keeping it here avoids coupling to a CSS file the
// rest of the overlays don't depend on either.
if (typeof document !== 'undefined' && !document.getElementById('win-overlay-styles')) {
  const style = document.createElement('style');
  style.id = 'win-overlay-styles';
  style.textContent = `
    @keyframes win-scrim-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes win-icon-pop {
      0%   { transform: scale(0.6) rotate(-8deg); opacity: 0; }
      60%  { transform: scale(1.08) rotate(2deg); opacity: 1; }
      100% { transform: scale(1) rotate(0); opacity: 1; }
    }
    @keyframes win-record-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 6px 18px rgba(255, 94, 98, 0.35); }
      50%      { transform: scale(1.04); box-shadow: 0 8px 24px rgba(255, 94, 98, 0.55); }
    }
  `;
  document.head.appendChild(style);
}
