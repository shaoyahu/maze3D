import { type ReactNode } from 'react';

export interface ButtonProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  'data-testid'?: string;
  // P2-5 FR-5: opt-in 150ms hover 上浮。默认 false,既有的所有调用点
  // (Settings / LevelSelect / 各种卡片按钮) 行为不变——只有主菜单按钮
  // 会显式传 true。这样把 "成品游戏感" 的视觉增强只施加在最该出现的地方。
  hoverLift?: boolean;
}

export function Button({ onClick, children, variant = 'primary', disabled, hoverLift, ...rest }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={rest['data-testid']}
      className={`btn btn-${variant}${hoverLift ? ' main-menu-button' : ''}`}
      style={{
        padding: '10px 22px',
        fontSize: 16,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? 'var(--danger)' : 'var(--panel)',
        color: variant === 'secondary' ? 'var(--fg)' : '#1a1a1a',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
