import { memo } from 'react';
import { useT } from '../../i18n';

// F-2026-07-01-FCR-L-6: memoize ControlHints. The HUD parent re-renders
// every game tick (multiple store subscriptions); without memo this
// component also re-renders and the i18n `t()` lookup + array rebuild
// run on every tick. Props are stable (none — uses store directly),
// so memo is safe.
export const ControlHints = memo(function ControlHints() {
  const t = useT();
  // The kbd column holds the keycap label (WASD / 鼠标 / P / ESC); the
  // span column holds the description. In the original Chinese layout
  // 鼠标 had a placeholder `l`; in EN the keycap itself reads "Look".
  const items = [
    { k: 'WASD', l: t('controls.move') },
    { k: t('controls.look'), l: '' },
    { k: 'P', l: t('controls.pause') },
    { k: 'ESC', l: t('controls.releaseMouse') },
  ];
  return (
    <div
      style={{
        position: 'absolute', top: 80, left: 16, display: 'flex', flexDirection: 'column', gap: 6,
        background: 'var(--panel)', padding: 10, borderRadius: 8, border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      {items.map((it) => (
        <div key={it.k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <kbd
            style={{
              background: 'var(--bg-inset)',
              color: 'var(--fg)',
              border: '1px solid var(--border-strong)',
              padding: '1px 6px',
              borderRadius: 4,
              minWidth: 50,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >{it.k}</kbd>
          <span style={{ color: 'var(--fg)' }}>{it.l}</span>
        </div>
      ))}
    </div>
  );
});