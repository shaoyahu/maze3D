import type { CSSProperties } from 'react';
import { Button } from './components/Button';

export interface MainMenuProps {
  onStart: () => void;
  onSettings: () => void;
  onEditor?: () => void;
}

export function MainMenu({ onStart, onSettings, onEditor }: MainMenuProps) {
  return (
    <div style={overlayStyle}>
      <h1 style={{ fontSize: 48, margin: 0 }}>3D Maze</h1>
      <p style={{ opacity: 0.7, marginTop: 4 }}>在限时内找到出口</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
        <Button onClick={onStart}>开始</Button>
        {onEditor && (
          <Button onClick={onEditor} variant="secondary" data-testid="main-menu-editor">关卡编辑器</Button>
        )}
        <Button onClick={onSettings} variant="secondary">设置</Button>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', background: 'var(--bg)',
};
