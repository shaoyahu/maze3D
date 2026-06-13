import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../src/ui/components/Button';

// P3-B-L6: pin the className composition for Button so a future change
// can't reintroduce the unreachable `main-menu-button` fallback branch
// (the prop's resolvedStyle always picks `btn-hover-lift` first when
// hoverLift=true, so the legacy class is dead code).
describe('Button className composition (P3-B-L6)', () => {
  it('includes btn-hover-lift when hoverLift=true', () => {
    render(
      <Button onClick={() => {}} hoverLift data-testid="b">
        OK
      </Button>,
    );
    const el = screen.getByTestId('b');
    expect(el.className).toMatch(/btn-hover-lift/);
  });

  it('does NOT include the legacy main-menu-button class when hoverLift=true', () => {
    render(
      <Button onClick={() => {}} hoverLift data-testid="b">
        OK
      </Button>,
    );
    const el = screen.getByTestId('b');
    expect(el.className).not.toMatch(/main-menu-button/);
  });

  it('does NOT include btn-hover-lift when neither hoverLift nor hoverStyle is set', () => {
    render(
      <Button onClick={() => {}} data-testid="b">
        OK
      </Button>,
    );
    const el = screen.getByTestId('b');
    expect(el.className).not.toMatch(/btn-hover-lift/);
    expect(el.className).not.toMatch(/main-menu-button/);
  });

  it('uses hoverStyle="glow" when explicitly set', () => {
    render(
      <Button onClick={() => {}} hoverStyle="glow" data-testid="b">
        OK
      </Button>,
    );
    const el = screen.getByTestId('b');
    expect(el.className).toMatch(/btn-hover-glow/);
    expect(el.className).not.toMatch(/btn-hover-lift/);
  });
});