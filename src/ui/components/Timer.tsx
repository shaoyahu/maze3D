import { formatTime } from '../../utils/time';

export function Timer({ seconds, urgent }: { seconds: number; urgent: boolean }) {
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
}
