import type { CSSProperties } from 'react';
import { Button } from './components/Button';
import { useGameStore } from '../store/gameStore';
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

export function GameOverOverlay({ onRetry, onQuit }: { onRetry: () => void; onQuit: () => void; }) {
  const t = useT();
  const currentMode = useGameStore((s) => s.currentMode);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const collected = useGameStore((s) => s.pickupCount.collected);
  const isSurvive = currentMode === 'survive';
  return (
    <div style={overlayStyle}>
      <h2 style={{ color: 'var(--danger)' }}>
        {t(GAMEOVER_TITLE_KEYS[currentMode])}
      </h2>
      {isSurvive && (
        <>
          <p>{t('overlays.gameOver.survived', { time: formatTime(elapsedTime) })}</p>
          <p>{t('overlays.gameOver.hitCount', { count: collected })}</p>
        </>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button onClick={onRetry}>{t('overlays.gameOver.retry')}</Button>
        <Button onClick={onQuit} variant="secondary">{t('overlays.gameOver.backToMenu')}</Button>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
};