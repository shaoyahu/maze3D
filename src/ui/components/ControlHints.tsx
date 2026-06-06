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
        <div key={it.k} style={{ display: 'flex', gap: 8 }}>
          <kbd style={{ background: '#000', color: 'var(--fg)', padding: '1px 6px', borderRadius: 4, minWidth: 50, textAlign: 'center' }}>{it.k}</kbd>
          <span>{it.l}</span>
        </div>
      ))}
    </div>
  );
}
