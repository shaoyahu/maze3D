import { useGameStore } from '../../store/gameStore';
import type { Pickup } from '../../maze/types';
// F-2026-07-01-L-2: centralized key color constant imported from utils/colors.ts
// instead of locally duplicated.
import { KEY_COLOR_CSS as KEY_COLOR_SWATCH } from '../../utils/colors';

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
            {/* F5: keep the corner badge (works for filled + empty) and drop
                the center placeholder; both rendering the digit meant empty
                slots showed "1 1" / "2 2" — visually noisy and read twice by
                screen readers. React renders `undefined` as nothing, so a null
                slot paints an empty box. */}
            {s?.type}
            {/* P2-18: when the slot holds a key with a keyColor, render a
                small color swatch in the bottom-right corner so the player
                can distinguish red/blue/green/yellow keys at a glance. */}
            {s?.type === 'key' && s?.keyColor && (
              <span
                style={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: KEY_COLOR_SWATCH[s.keyColor],
                  border: '1px solid rgba(0,0,0,0.3)',
                  pointerEvents: 'none',
                }}
              />
            )}
            <span style={{
              position: 'absolute', top: 1, left: 4, fontSize: 10,
              color: 'var(--border)', pointerEvents: 'none',
            }}>{i + 1}</span>
            {isFlashing && (
              <div
                key={flash.version}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 8,
                  // P2-2 F13: pulse in --accent-strong so "just used" reads
                  // as distinct from the permanent "has item" border, which
                  // stays in --accent (see line above).
                  border: '2px solid var(--accent-strong)',
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
