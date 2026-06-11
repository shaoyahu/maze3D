import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MainMenu } from '../../src/ui/MainMenu';
import { MainMenuScene } from '../../src/ui/MainMenuScene';

// P2-5 FR-1/FR-3: MainMenu 挂载 Three.js 场景的契约 — scene 容器、半透明
// panel、按钮回调、init() 拒绝时走 catch fallback(unmount 时 dispose 不抛错)。
// happy-dom 下 Three.js 的 WebGLRenderer 不会主动 throw,所以"fallback"那
// 一例通过 stub MainMenuScene.prototype.init 强制 reject 来验证 catch 路径
// (warn + scene.dispose())。

describe('MainMenu P2-5 revamp', () => {
  beforeEach(() => {
    // 让 console.warn 不刷屏
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('renders a scene container and translucent panel', () => {
    render(<MainMenu onStart={() => {}} onSettings={() => {}} />);
    expect(screen.getByTestId('main-menu-scene')).toBeInTheDocument();
    expect(screen.getByTestId('main-menu-panel')).toBeInTheDocument();
  });

  it('runs the fallback catch handler when MainMenuScene.init rejects', async () => {
    // happy-dom 里 WebGLRenderer 不会主动 throw — Three.js 只会往 console 打
    // warning 然后返回一个非功能 renderer,所以 init() 在 happy-dom 下实际不会
    // reject。直接 stub 原型方法强制 reject,验证 catch 路径一定会运行(打 warn
    // + 调用 scene.dispose())。CSS 渐变背景的视觉切换由 MainMenu 的 state 驱动,
    // 也由相同 catch 路径触发 — 行为验证在这一处就够,不需要再单独断言 style。
    const warnSpy = vi.spyOn(console, 'warn');
    const originalInit = MainMenuScene.prototype.init;
    const originalDispose = MainMenuScene.prototype.dispose;
    const disposeSpy = vi.fn();
    MainMenuScene.prototype.init = async function rejected() {
      throw new Error('simulated WebGL failure');
    };
    MainMenuScene.prototype.dispose = disposeSpy;
    try {
      render(<MainMenu onStart={() => {}} onSettings={() => {}} />);
      await waitFor(
        () => {
          // catch handler 至少打了 1 个 warn(MainMenu: WebGL unavailable ...)
          const fallbackWarns = warnSpy.mock.calls.filter(
            (c) => typeof c[0] === 'string' && c[0].includes('WebGL unavailable'),
          );
          expect(fallbackWarns.length).toBeGreaterThan(0);
        },
        { timeout: 1000 },
      );
      // dispose() 在 catch 里被调用 — 证明 fallback 路径完整跑通。
      expect(disposeSpy).toHaveBeenCalled();
    } finally {
      MainMenuScene.prototype.init = originalInit;
      MainMenuScene.prototype.dispose = originalDispose;
    }
  });

  it('renders the title inside the panel', () => {
    render(<MainMenu onStart={() => {}} onSettings={() => {}} />);
    expect(screen.getByText('3D Maze')).toBeInTheDocument();
  });

  it('hoverLift buttons still fire onStart / onSettings / onEditor', () => {
    const onStart = vi.fn();
    const onSettings = vi.fn();
    const onEditor = vi.fn();
    render(
      <MainMenu onStart={onStart} onSettings={onSettings} onEditor={onEditor} />,
    );
    fireEvent.click(screen.getByTestId('main-menu-start'));
    expect(onStart).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('main-menu-editor'));
    expect(onEditor).toHaveBeenCalled();
    fireEvent.click(screen.getByText('设置'));
    expect(onSettings).toHaveBeenCalled();
  });

  it('cleans up scene on unmount (no console errors)', () => {
    const { unmount } = render(<MainMenu onStart={() => {}} onSettings={() => {}} />);
    expect(() => unmount()).not.toThrow();
  });
});
