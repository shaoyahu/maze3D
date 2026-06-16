import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TutorialBanner } from '../../src/ui/components/TutorialBanner';
import { useTutorialStore } from '../../src/store/tutorialStore';
import type { TutorialStep } from '../../src/maze/types';

const STEPS: TutorialStep[] = [
  { id: 's1', messageKey: 'tutorial.test.step1', trigger: { type: 'reached-exit' } },
  { id: 's2', messageKey: 'tutorial.test.step2', trigger: { type: 'reached-exit' } },
];

beforeEach(() => {
  useTutorialStore.getState().reset();
});

describe('TutorialBanner', () => {
  it('renders nothing when no tutorial is active', () => {
    const { container } = render(<TutorialBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when currentStepId is null even if steps exist (tutorial finished)', () => {
    useTutorialStore.setState({ steps: STEPS, currentStepId: null });
    const { container } = render(<TutorialBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the current step message and progress chip', () => {
    useTutorialStore.getState().start(STEPS);
    render(<TutorialBanner />);
    expect(screen.getByTestId('tutorial-banner')).toBeInTheDocument();
    expect(screen.getByTestId('tutorial-progress').textContent).toBe('1/2');
    // Falls back to the messageKey when i18n has no entry — the lookup
    // helper warns and returns the key string verbatim. Either way the
    // banner surfaces SOMETHING for the testid query.
    expect(screen.getByTestId('tutorial-message').textContent).toBe('tutorial.test.step1');
  });

  it('updates the progress chip and message after dispatch advances', () => {
    useTutorialStore.getState().start(STEPS);
    render(<TutorialBanner />);
    expect(screen.getByTestId('tutorial-progress').textContent).toBe('1/2');
    act(() => {
      useTutorialStore.getState().dispatch({ kind: 'reached-exit' });
    });
    expect(screen.getByTestId('tutorial-progress').textContent).toBe('2/2');
    expect(screen.getByTestId('tutorial-message').textContent).toBe('tutorial.test.step2');
  });

  it('hides itself after the last step advances', () => {
    useTutorialStore.getState().start(STEPS);
    render(<TutorialBanner />);
    act(() => {
      useTutorialStore.getState().dispatch({ kind: 'reached-exit' });
      useTutorialStore.getState().dispatch({ kind: 'reached-exit' });
    });
    expect(screen.queryByTestId('tutorial-banner')).toBeNull();
  });
});