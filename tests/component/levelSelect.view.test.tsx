// P4 refactor-fp2d: the LevelSelect "View" segmented control
// is a presentation toggle (2D top-down vs first-person 3D)
// that round-trips through the `view` URL query. The control
// lives in the status bar (a thin horizontal strip) rather
// than the main form because the view is independent of
// level-source / algorithm / level-count pickers. The
// test pins the three contracts:
//
//   1. The control renders both options (2D Top-down /
//      3D First-person).
//   2. The control defaults to "2d".
//   3. Clicking the "3D First-person" button changes the
//      view state to "fp3d", and the next onPick call
//      forwards view="fp3d" to the parent.
//
// The test uses the ConfirmProvider wrapper because the
// surrounding LevelSelect tree pulls in useConfirm (the
// "delete custom level" confirmation dialog); same pattern
// as menus.test.tsx.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LevelSelect, type LevelDef } from '../../src/ui/LevelSelect';
import { ConfirmProvider } from '../../src/ui/useConfirm';

function renderLevelSelect(onPick = vi.fn(), onBack = vi.fn()) {
  const levels: LevelDef[] = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
  return render(
    <ConfirmProvider>
      <LevelSelect available={levels} onPick={onPick} onBack={onBack} />
    </ConfirmProvider>,
  );
}

describe('LevelSelect P4 refactor-fp2d — View toggle', () => {
  it('renders the view segmented control with both options', () => {
    renderLevelSelect();
    // P4 refactor-fp2d: the status-bar segmented control
    // exposes one button per ViewMode literal. The test
    // queries by data-testid (the canonical surface for
    // E2E selectors) — the same id pattern the production
    // markup uses.
    const twoD = screen.getByTestId('view-option-2d');
    const threeD = screen.getByTestId('view-option-fp3d');
    expect(twoD).toBeInTheDocument();
    expect(threeD).toBeInTheDocument();
  });

  it('defaults to view="2d" (the back-compat URL default)', () => {
    // P4 refactor-fp2d: the LevelSelect's view state
    // initializes to '2d', so a user who doesn't toggle
    // the control gets the historical top-down rendering
    // and a URL with no `?view=` param. The test pins
    // this by checking the ARIA-pressed state of the two
    // buttons: 2d is pressed, fp3d is not.
    renderLevelSelect();
    const twoD = screen.getByTestId('view-option-2d');
    const threeD = screen.getByTestId('view-option-fp3d');
    expect(twoD.getAttribute('aria-pressed')).toBe('true');
    expect(threeD.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the 3D First-person option flips aria-pressed', () => {
    // The toggle contract: clicking the inactive button
    // makes it active (and vice versa). The test pins
    // both directions — clicking 3D flips it to active,
    // clicking 2D again flips it back — so a future
    // regression that breaks the toggle state would
    // fail one of the two assertions.
    renderLevelSelect();
    const twoD = screen.getByTestId('view-option-2d');
    const threeD = screen.getByTestId('view-option-fp3d');
    fireEvent.click(threeD);
    expect(threeD.getAttribute('aria-pressed')).toBe('true');
    expect(twoD.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(twoD);
    expect(twoD.getAttribute('aria-pressed')).toBe('true');
    expect(threeD.getAttribute('aria-pressed')).toBe('false');
  });

  it('forwards the picked view to onPick when the user starts a level', async () => {
    // The end-to-end contract: the view state is part
    // of the `onPick` payload. The default view flows
    // through as '2d' (no toggle), and clicking the 3D
    // option + starting a level flows through as 'fp3d'.
    // The test exercises both paths because a future
    // regression that drops the view from onPick (e.g.
    // a refactor that flattens the signature) would
    // pass the default-path assertion but fail the
    // fp3d-path one.
    const onPick = vi.fn();
    renderLevelSelect(onPick);
    // Default-view path.
    fireEvent.change(screen.getByTestId('sublevel-select'), { target: { value: 'a' } });
    fireEvent.click(screen.getByTestId('start-button'));
    expect(onPick).toHaveBeenLastCalledWith('a', undefined, '2d');
    // 3D-view path.
    fireEvent.click(screen.getByTestId('view-option-fp3d'));
    fireEvent.click(screen.getByTestId('start-button'));
    expect(onPick).toHaveBeenLastCalledWith('a', undefined, 'fp3d');
  });
});
