import type { CSSProperties } from 'react';
import { Button } from './components/Button';
import { useGameStore } from '../store/gameStore';
import { formatTime } from '../utils/time';
import { useT } from '../i18n';

export function GameOverOverlay({ onRetry, onQuit }: { onRetry: () => void; onQuit: () => void; }) {
  const t = useT();
  const currentMode = useGameStore((s) => s.currentMode);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const collected = useGameStore((s) => s.pickupCount.collected);
  const isSurvive = currentMode === 'survive';
  return (
    <div style={overlayStyle}>
      <h2 style={{ color: 'var(--danger)' }}>
        {isSurvive ? t('overlays.gameOver.titleSurvive') : t('overlays.gameOver.titleTimeTrial')}
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