import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  // P2-5 FR-5: opt-in 150ms hover 上浮。默认 false,既有的所有调用点
  // (Settings / LevelSelect / 各种卡片按钮) 行为不变——只有主菜单按钮
  // 会显式传 true。这样把 "成品游戏感" 的视觉增强只施加在最该出现的地方。
  hoverLift?: boolean;
  // P2-5+: 多种悬停样式,提供给需要"同宽不同 hover"的并列按钮使用。
  // 留空时兼容旧行为 (由 hoverLift 决定是否上浮)。
  hoverStyle?: 'lift' | 'glow' | 'fade';
  // 显式宽度,通常用于暂停页等并列按钮场景。
  width?: number | string;
  // P3-B-L25: pass-through for aria-busy so a button can announce it is
  // mid-async-work (e.g. file import awaiting readJsonFile). Only
  // emitted when explicitly true; resting buttons stay quiet.
  'aria-busy'?: boolean;
  // Pass-through for React Testing Library's data-testid so callers can
  // target buttons from tests without TS7053 on `rest[...]` indexing.
  // Rendered verbatim onto the underlying <button>.
  'data-testid'?: string;
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
  // P3-B-L6: resolvedStyle always wins (hoverLift resolves to 'lift'
  // above), so the legacy `main-menu-button` fallback branch was
  // unreachable dead code. Only emit the hover class when resolvedStyle
  // is set.
  const resolvedStyle: 'lift' | 'glow' | 'fade' | undefined =
    hoverStyle ?? (hoverLift ? 'lift' : undefined);
  const className = `btn btn-${variant}${
    resolvedStyle ? ` btn-hover-${resolvedStyle}` : ''
  }`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={rest['data-testid']}
      className={className}
      // P3-B-L25: only emit aria-busy when explicitly true; React's
      // boolean attribute rendering omits the attr when value is false
      // or undefined.
      aria-busy={rest['aria-busy'] === true ? true : undefined}
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
