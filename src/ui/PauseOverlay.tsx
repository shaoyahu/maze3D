import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { Button } from './components/Button';
import { formatTime } from '../utils/time';

export function PauseOverlay({ onResume, onQuit }: { onResume: () => void; onQuit: () => void; }) {
  const pickupCount = useGameStore((s) => s.pickupCount);
  const currentLevelId = useGameStore((s) => s.currentLevelId);
  const best = useLevelStore((s) => (currentLevelId ? s.bestByLevel[currentLevelId] : undefined));
  return (
    <div style={overlayStyle}>
      <h2>已暂停</h2>
      <p>已收集: {pickupCount.collected} / {pickupCount.total}</p>
      {best && <p>历史最佳: {formatTime(best.timeUsed)}</p>}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button onClick={onResume}>继续</Button>
        <Button onClick={onQuit} variant="secondary">返回主菜单</Button>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
};
