import type { CSSProperties } from 'react';
import { Button } from './components/Button';

export function GameOverOverlay({ onRetry, onQuit }: { onRetry: () => void; onQuit: () => void; }) {
  return (
    <div style={overlayStyle}>
      <h2 style={{ color: 'var(--danger)' }}>时间到！</h2>
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
