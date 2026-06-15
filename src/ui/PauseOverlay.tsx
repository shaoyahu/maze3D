import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { Button } from './components/Button';
import { Settings } from './Settings';
import { formatTime } from '../utils/time';
import { useT } from '../i18n';

const PAUSE_BTN_WIDTH = 240;

export function PauseOverlay({ onResume, onQuit }: { onResume: () => void; onQuit: () => void; }) {
  const t = useT();
  const pickupCount = useGameStore((s) => s.pickupCount);
  const currentLevelId = useGameStore((s) => s.currentLevelId);
  const best = useLevelStore((s) => (currentLevelId ? s.bestByLevel[currentLevelId] : undefined));
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return (
      <div style={overlayStyle}>
        <Settings onBack={() => setShowSettings(false)} />
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <h2>{t('overlays.pause.title')}</h2>
      <p>{t('overlays.pause.collected', pickupCount)}</p>
      {best && <p>{t('overlays.pause.best', { time: formatTime(best.timeUsed) })}</p>}
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
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
};

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 12,
  marginTop: 20,
};