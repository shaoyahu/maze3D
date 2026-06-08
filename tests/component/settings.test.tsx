import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from '../../src/ui/Settings';
import { useSettingsStore } from '../../src/store/settingsStore';

describe('Settings (P2-2 #6)', () => {
  beforeEach(() => {
    useSettingsStore.getState().set('darkMode', false);
  });

  it('renders the dark-mode checkbox', () => {
    render(<Settings onBack={() => {}} />);
    expect(screen.getByLabelText('深色模式')).toBeInTheDocument();
  });

  it('reflects the current darkMode value', () => {
    useSettingsStore.getState().set('darkMode', true);
    render(<Settings onBack={() => {}} />);
    expect(screen.getByLabelText('深色模式')).toBeChecked();
  });

  it('clicking the checkbox flips darkMode in the store', async () => {
    const user = userEvent.setup();
    render(<Settings onBack={() => {}} />);
    const checkbox = screen.getByLabelText('深色模式');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(useSettingsStore.getState().darkMode).toBe(true);
    await user.click(checkbox);
    expect(useSettingsStore.getState().darkMode).toBe(false);
  });
});
