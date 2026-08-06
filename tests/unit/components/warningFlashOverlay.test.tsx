// P3-3: WarningFlashOverlay component test.
//
// The overlay is conditional on `warningFlashUntil > Date.now()/1000`.
// The test exercises three states:
//
//   1. Inactive: `warningFlashUntil === 0` → component returns null.
//   2. Active: `warningFlashUntil = now + 0.5` → component renders
//      a red div with the `warning-flash-overlay` test id.
//   3. Re-mount: bumping the trigger id re-mounts the div with
//      a new `key`, restarting the CSS animation. The test
//      asserts the `data-trigger-id` attribute tracks the
//      store's trigger counter.
//
// Wall-clock compare in the component means we have to set the
// timestamp to a value clearly in the future. 60 seconds is
// well past any test runtime, so the overlay stays mounted
// across the synchronous React render without race conditions.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WarningFlashOverlay } from '../../../src/ui/components/WarningFlashOverlay';
import { useGameStore } from '../../../src/store/gameStore';

beforeEach(() => {
  useGameStore.setState({ warningFlashUntil: 0, warningFlashTriggerId: 0 });
});

describe('WarningFlashOverlay (P3-3)', () => {
  it('returns null when warningFlashUntil is 0 (no active warning)', () => {
    const { container } = render(<WarningFlashOverlay />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('warning-flash-overlay')).toBeNull();
  });

  it('renders the red overlay when warningFlashUntil is in the future', () => {
    // 60s is far past any synchronous test runtime, so the
    // wall-clock compare inside the component stays true.
    useGameStore.setState({ warningFlashUntil: Date.now() / 1000 + 60 });
    render(<WarningFlashOverlay />);
    const overlay = screen.getByTestId('warning-flash-overlay');
    expect(overlay).toBeInTheDocument();
    // The data-trigger-id attribute tracks the store's counter
    // so tests can assert the re-mount contract (see below).
    expect(overlay.getAttribute('data-trigger-id')).toBe('0');
  });

  it('re-mounts on trigger id bump (a second warning restarts the CSS animation)', () => {
    useGameStore.setState({
      warningFlashUntil: Date.now() / 1000 + 60,
      warningFlashTriggerId: 0,
    });
    const { rerender } = render(<WarningFlashOverlay />);
    const before = screen.getByTestId('warning-flash-overlay');
    expect(before.getAttribute('data-trigger-id')).toBe('0');

    // Bump the trigger id (simulating a second warning landing
    // before the first overlay's 0.5s window closes).
    useGameStore.getState().bumpWarningFlashTriggerId();
    rerender(<WarningFlashOverlay />);

    // React's `key={triggerId}` re-mounted the element. The new
    // node has the new trigger id; without the key prop React
    // would have just updated the existing element and the
    // animation would not have restarted.
    const after = screen.getByTestId('warning-flash-overlay');
    expect(after.getAttribute('data-trigger-id')).toBe('1');
  });
});
