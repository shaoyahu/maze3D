import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from './components/Button';
import { MainMenuScene } from './MainMenuScene';

export interface MainMenuProps {
  onStart: () => void;
  onSettings: () => void;
  onEditor?: () => void;
}

export function MainMenu({ onStart, onSettings, onEditor }: MainMenuProps) {
  const sceneContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<MainMenuScene | null>(null);
  // CSS-fallback when WebGL init throws. Keeps the rest of the menu usable.
  const [useFallbackBackground, setUseFallbackBackground] = useState(false);

  useEffect(() => {
    if (!sceneContainerRef.current) return;
    const scene = new MainMenuScene(sceneContainerRef.current);
    sceneRef.current = scene;
    scene.init().catch((err) => {
      // FR-1: WebGL 不可用时回退到 CSS 渐变。日志 + 切 flag,场景不残留。
      console.warn('MainMenu: WebGL unavailable, falling back to CSS gradient', err);
      setUseFallbackBackground(true);
      scene.dispose();
      sceneRef.current = null;
    });
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const sceneLayerStyle: CSSProperties = useFallbackBackground
    ? {
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, var(--accent) 0%, var(--bg) 100%)',
      }
    : { position: 'absolute', inset: 0, background: 'var(--bg)' };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={sceneContainerRef} data-testid="main-menu-scene" style={sceneLayerStyle} />
      <div
        data-testid="main-menu-panel"
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <h1 style={{ fontSize: 48, margin: 0, color: 'var(--fg)' }}>3D Maze</h1>
        <p style={{ opacity: 0.7, marginTop: 4, color: 'var(--fg)' }}>在限时内找到出口</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
          <Button onClick={onStart} hoverLift data-testid="main-menu-start">开始</Button>
          {onEditor && (
            <Button onClick={onEditor} variant="secondary" hoverLift data-testid="main-menu-editor">关卡编辑器</Button>
          )}
          <Button onClick={onSettings} variant="secondary" hoverLift>设置</Button>
        </div>
      </div>
    </div>
  );
}
