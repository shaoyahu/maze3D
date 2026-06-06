import { type ReactNode } from 'react';

export interface ButtonProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export function Button({ onClick, children, variant = 'primary', disabled }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
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
