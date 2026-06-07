import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Crosshair } from '../../src/ui/components/Crosshair';

describe('Crosshair', () => {
  it('renders an absolutely-positioned element with pointer-events disabled', () => {
    const { getByTestId } = render(<Crosshair />);
    const el = getByTestId('crosshair');
    expect(el).toBeInTheDocument();
    const style = el.style;
    expect(style.position).toBe('absolute');
    expect(style.pointerEvents).toBe('none');
  });

  it('is marked aria-hidden so screen readers skip it', () => {
    const { getByTestId } = render(<Crosshair />);
    expect(getByTestId('crosshair').getAttribute('aria-hidden')).toBe('true');
  });
});
