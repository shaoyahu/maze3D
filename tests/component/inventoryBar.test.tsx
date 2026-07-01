import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryBar } from '../../src/ui/components/InventoryBar';
import { useGameStore } from '../../src/store/gameStore';
import type { Pickup } from '../../src/maze/types';

const sampleKey: Pickup = { id: crypto.randomUUID(), x: 0, z: 0, type: 'key', value: 1 };
const sampleHealth: Pickup = { id: crypto.randomUUID(), x: 1, z: 0, type: 'health', value: 1 };

describe('InventoryBar (P2-2 #12)', () => {
  beforeEach(() => {
    useGameStore.getState().goToMenu();
    useGameStore.setState({ useItemFlash: null });
  });

  it('always renders the digit hint badge for each slot', () => {
    render(<InventoryBar slots={[null, null]} />);
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the pickup type when the slot is filled', () => {
    render(<InventoryBar slots={[sampleKey, null]} />);
    expect(screen.getByText('key')).toBeInTheDocument();
  });

  it('renders a flash overlay when useItemFlash matches the slot', () => {
    useGameStore.setState({ useItemFlash: { slot: 0, version: 1 } });
    const { container } = render(<InventoryBar slots={[sampleKey, sampleHealth]} />);
    // The flash overlay is an absolutely-positioned div with the inventory-flash
    // animation. It sits on top of the slot 0 wrapper.
    const flashEl = container.querySelector('[style*="inventory-flash"]');
    expect(flashEl).toBeTruthy();
  });

  it('does not render a flash overlay when useItemFlash is null', () => {
    const { container } = render(<InventoryBar slots={[sampleKey, sampleHealth]} />);
    const flashEl = container.querySelector('[style*="inventory-flash"]');
    expect(flashEl).toBeNull();
  });

  it('renders exactly one flash overlay even when targeting slot 1 (not slot 0)', () => {
    useGameStore.setState({ useItemFlash: { slot: 1, version: 1 } });
    const { container } = render(<InventoryBar slots={[sampleKey, sampleHealth]} />);
    // The flash should appear on exactly one slot, not both. Counting via
    // the animation style attribute is more robust than DOM-tree walking.
    const flashes = container.querySelectorAll('[style*="inventory-flash"]');
    expect(flashes.length).toBe(1);
  });

  // P2-18: key color swatch
  it('renders a color swatch when the slot holds a key with keyColor', () => {
    const redKey: Pickup = { id: crypto.randomUUID(), x: 0, z: 0, type: 'key', value: 1, keyColor: 'red' };
    const { container } = render(<InventoryBar slots={[redKey, null]} />);
    // The swatch is a span with a background color matching the key color.
    // React renders inline styles using the original CSS value (hex).
    const swatch = container.querySelector('[style*="background: #ff5050"]');
    expect(swatch).toBeTruthy();
  });

  it('does not render a color swatch when the key has no keyColor', () => {
    const { container } = render(<InventoryBar slots={[sampleKey, null]} />);
    // sampleKey has no keyColor, so no swatch should appear.
    const swatch = container.querySelector('[style*="background: #ff5050"]');
    expect(swatch).toBeNull();
  });

  it('renders different swatch colors for different keyColors', () => {
    const blueKey: Pickup = { id: crypto.randomUUID(), x: 0, z: 0, type: 'key', value: 1, keyColor: 'blue' };
    const { container } = render(<InventoryBar slots={[blueKey, null]} />);
    // Blue key swatch should use the blue CSS color.
    const swatch = container.querySelector('[style*="background: #5fa8ff"]');
    expect(swatch).toBeTruthy();
  });
});
