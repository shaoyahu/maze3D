import { memo } from 'react';
import { formatTime } from '../../utils/time';

// P3-B-L13: wrap in React.memo so HUD parent re-renders triggered by
// player movement/animation only re-render Timer when its actual
// (seconds, urgent) props change — not on every tick that doesn't
// touch the timer. displayName is set so the perf contract is pin-
// testable.
export const Timer = memo(function Timer({ seconds, urgent }: { seconds: number; urgent: boolean }) {
  return (
    <div
      role="timer"
      style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--panel)', color: urgent ? 'var(--danger)' : 'var(--fg)',
        padding: '8px 18px', borderRadius: 10, fontWeight: 700, fontSize: 28, fontVariantNumeric: 'tabular-nums',
        border: '1px solid var(--border)',
      }}
    >
      ⏱ {formatTime(seconds)}
    </div>
  );
});
Timer.displayName = 'Timer';
