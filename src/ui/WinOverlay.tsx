import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { Button } from './components/Button';
import { formatTime } from '../utils/time';
import { useT } from '../i18n';

export function WinOverlay({ onRetry, onQuit, onNext }: { onRetry: () => void; onQuit: () => void; onNext?: () => void; }) {
  const t = useT();
  const pickupCount = useGameStore((s) => s.pickupCount);
  const currentLevelId = useGameStore((s) => s.currentLevelId);
  const timeUsed = useGameStore((s) => s.elapsedTime);
  const newRecord = useGameStore((s) => s.lastWinIsNewRecord);
  const best = useLevelStore((s) => (currentLevelId ? s.bestByLevel[currentLevelId] : undefined));
  return (
    <div style={overlayStyle}>
      <h2 style={{ color: 'var(--accent)' }}>{t('overlays.win.title')}</h2>
      <p>{t('overlays.win.timeUsed', { time: formatTime(timeUsed) })}</p>
      <p>{t('overlays.win.pickups', pickupCount)}</p>
      {best && <p>{t('overlays.win.best', { time: formatTime(best.timeUsed) })}</p>}
      {newRecord && <p style={{ color: 'var(--accent)' }}>{t('overlays.win.newRecord')}</p>}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button onClick={onRetry}>{t('overlays.win.retry')}</Button>
        {onNext && <Button onClick={onNext}>{t('overlays.win.next')}</Button>}
        <Button onClick={onQuit} variant="secondary">{t('overlays.win.backToMenu')}</Button>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
};