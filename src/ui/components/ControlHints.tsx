export function ControlHints() {
  const items = [
    { k: 'WASD', l: '移动' },
    { k: '鼠标', l: '视角' },
    { k: 'P', l: '暂停' },
    { k: 'ESC', l: '释放鼠标' },
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
}
