import type { Pickup } from '../../maze/types';

export function InventoryBar({ slots }: { slots: (Pickup | null)[] }) {
  return (
    <div
      style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8,
      }}
    >
      {slots.map((s, i) => (
        <div
          key={i}
          style={{
            width: 56, height: 56, border: '2px solid var(--border)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--panel)', fontSize: 14,
          }}
        >
          {s ? s.type : <span style={{ color: 'var(--border)' }}>{i + 1}</span>}
        </div>
      ))}
    </div>
  );
}
