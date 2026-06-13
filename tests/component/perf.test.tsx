import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Crosshair } from '../../src/ui/components/Crosshair';
import { Timer } from '../../src/ui/components/Timer';
import { formatTime } from '../../src/utils/time';

// P3-Theme 3 — perf micro-optimizations. These tests don't measure
// performance directly (vitest happy-dom is too noisy for that); they
// pin the memo contract so a future refactor can't silently drop the
// optimization. The functional behavior is covered by per-component
// tests (crosshair.test.tsx, minimap.test.tsx, EditorViewport.test.tsx).
describe('P3-Theme 3 memo contracts', () => {
  it('Crosshair is wrapped in React.memo with a displayName (B-L5)', () => {
    expect(Crosshair.displayName).toBe('Crosshair');
    expect(Crosshair.$$typeof?.toString()).toMatch(/Symbol\(react\.memo\)/);
  });

  it('Timer is wrapped in React.memo with a displayName (B-L13)', () => {
    expect(Timer.displayName).toBe('Timer');
    expect(Timer.$$typeof?.toString()).toMatch(/Symbol\(react\.memo\)/);
  });

  it('Timer renders formatted time and switches color when urgent (B-L13 functional pin)', () => {
    const { rerender } = render(<Timer seconds={65} urgent={false} />);
    expect(screen.getByRole('timer').textContent).toContain(formatTime(65));
    // Re-render with urgent=true flips the inline color. Memo doesn't
    // interfere because the prop changed.
    rerender(<Timer seconds={65} urgent={true} />);
    expect(screen.getByRole('timer').style.color).toBe('var(--danger)');
  });
});