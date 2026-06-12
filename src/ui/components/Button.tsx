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
  // P2-5+: 多种悬停样式,提供给需要"同宽不同 hover"的并列按钮使用。
  // 留空时兼容旧行为 (由 hoverLift 决定是否上浮)。
  hoverStyle?: 'lift' | 'glow' | 'fade';
  // 显式宽度,通常用于暂停页等并列按钮场景。
  width?: number | string;
}

export function Button({
  onClick,
  children,
  variant = 'primary',
  disabled,
  hoverLift,
  hoverStyle,
  width,
  ...rest
}: ButtonProps) {
  // 旧 hoverLift 行为兼容:保留 .main-menu-button 类,等价 hoverStyle='lift'。
  const resolvedStyle: 'lift' | 'glow' | 'fade' | undefined =
    hoverStyle ?? (hoverLift ? 'lift' : undefined);
  const className = `btn btn-${variant}${
    resolvedStyle ? ` btn-hover-${resolvedStyle}` : hoverLift ? ' main-menu-button' : ''
  }`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={rest['data-testid']}
      className={className}
      style={{
        padding: '10px 22px',
        fontSize: 16,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? 'var(--danger)' : 'var(--panel)',
        color: variant === 'secondary' ? 'var(--fg)' : '#1a1a1a',
        opacity: disabled ? 0.5 : 1,
        ...(width !== undefined ? { width } : {}),
      }}
    >
      {children}
    </button>
  );
}
