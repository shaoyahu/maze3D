import type { CSSProperties } from 'react';
import { Button } from './components/Button';
import { useGameStore } from '../store/gameStore';
import { formatTime } from '../utils/time';

export function GameOverOverlay({ onRetry, onQuit }: { onRetry: () => void; onQuit: () => void; }) {
  const currentMode = useGameStore((s) => s.currentMode);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const collected = useGameStore((s) => s.pickupCount.collected);
  const isSurvive = currentMode === 'survive';
  return (
    <div style={overlayStyle}>
      <h2 style={{ color: 'var(--danger)' }}>{isSurvive ? '坚持失败' : '时间到！'}</h2>
      {isSurvive && (
        <>
          <p>坚持了 {formatTime(elapsedTime)}</p>
          <p>击中数 {collected}</p>
        </>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button onClick={onRetry}>重试</Button>
        <Button onClick={onQuit} variant="secondary">返回主菜单</Button>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
};
