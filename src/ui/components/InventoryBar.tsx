import { useGameStore } from '../../store/gameStore';
import type { Pickup } from '../../maze/types';

export function InventoryBar({ slots }: { slots: (Pickup | null)[] }) {
  const flash = useGameStore((s) => s.useItemFlash);
  return (
    <div
      style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8,
      }}
    >
      {slots.map((s, i) => {
        const isFlashing = flash?.slot === i;
        const borderColor = s ? 'var(--accent)' : 'var(--border)';
        return (
          <div
            key={i}
            style={{
              position: 'relative',
              width: 56, height: 56, border: `2px solid ${borderColor}`, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--panel)', fontSize: 14,
            }}
          >
            {s ? s.type : <span style={{ color: 'var(--border)' }}>{i + 1}</span>}
            <span style={{
              position: 'absolute', top: 1, left: 4, fontSize: 10,
              color: 'var(--border)', pointerEvents: 'none',
            }}>{i + 1}</span>
            {isFlashing && (
              <div
                key={flash.version}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 8,
                  border: '2px solid var(--accent)',
                  animation: 'inventory-flash 0.4s ease-out forwards',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
