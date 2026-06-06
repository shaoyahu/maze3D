import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { Button } from './components/Button';
import { formatTime } from '../utils/time';

export function WinOverlay({ onRetry, onQuit, onNext }: { onRetry: () => void; onQuit: () => void; onNext?: () => void; }) {
  const pickupCount = useGameStore((s) => s.pickupCount);
  const currentLevelId = useGameStore((s) => s.currentLevelId);
  const timeRemaining = useGameStore((s) => s.timeRemaining);
  const initial = useGameStore((s) => s.currentMaze?.rules.initialTime ?? 0);
  const newRecord = useGameStore((s) => s.lastWinIsNewRecord);
  const best = useLevelStore((s) => (currentLevelId ? s.bestByLevel[currentLevelId] : undefined));
  const timeUsed = initial - timeRemaining;
  return (
    <div style={overlayStyle}>
      <h2 style={{ color: 'var(--accent)' }}>通关！</h2>
      <p>用时 {formatTime(timeUsed)}</p>
      <p>收集 {pickupCount.collected} / {pickupCount.total}</p>
      {best && <p>历史最佳 {formatTime(best.timeUsed)}</p>}
      {newRecord && <p style={{ color: 'var(--accent)' }}>新纪录！</p>}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button onClick={onRetry}>重玩</Button>
        {onNext && <Button onClick={onNext}>下一关</Button>}
        <Button onClick={onQuit} variant="secondary">返回主菜单</Button>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
};
