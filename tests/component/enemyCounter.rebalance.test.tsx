import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { EnemyCounter } from '../../src/ui/components/EnemyCounter';
import { useGameStore } from '../../src/store/gameStore';

describe('EnemyCounter P2-5 rebalance', () => {
  beforeEach(() => {
    useGameStore.setState({
      currentMode: 'survive',
      currentEnemyCount: 0,
    });
  });

  // FR-22: non-survive mode hides the counter
  it('returns null when currentMode is reach-exit', () => {
    useGameStore.setState({ currentMode: 'reach-exit', currentEnemyCount: 0 });
    const { container } = render(<EnemyCounter />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when currentMode is time-trial', () => {
    useGameStore.setState({ currentMode: 'time-trial', currentEnemyCount: 0 });
    const { container } = render(<EnemyCounter />);
    expect(container.firstChild).toBeNull();
  });

  // Survive mode: keep visible, even when count is 0 (player wants to see the cap)
  it('renders 0 / max when currentMode is survive with count 0', () => {
    useGameStore.setState({ currentMode: 'survive', currentEnemyCount: 0 });
    render(<EnemyCounter />);
    expect(document.body.textContent).toMatch(/敌人 0 \/ 10/);
  });

  it('renders N / max when currentMode is survive with count N', () => {
    useGameStore.setState({ currentMode: 'survive', currentEnemyCount: 3 });
    render(<EnemyCounter />);
    expect(document.body.textContent).toMatch(/敌人 3 \/ 10/);
  });
});