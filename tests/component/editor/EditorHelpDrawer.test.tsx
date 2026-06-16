// F-P2-9: EditorHelpDrawer cheat-sheet component test.
//
// Covers: default-no-render, open renders 4 sections, ESC closes,
// backdrop click closes, close button closes. Mirrors the WarningsPopup
// test pattern at EditorStatusBar.tsx:25-109 — same ESC + backdrop
// idiom.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { EditorHelpDrawer } from '../../../src/ui/editor/EditorHelpDrawer';

beforeEach(() => {
  // happy-dom provides document; nothing to reset.
});

describe('EditorHelpDrawer (P2-9 cheat-sheet)', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<EditorHelpDrawer open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders 4 sections when open=true', () => {
    render(<EditorHelpDrawer open onClose={() => {}} />);
    expect(screen.getByTestId('editor-help-section-tools')).toBeInTheDocument();
    expect(screen.getByTestId('editor-help-section-shortcuts')).toBeInTheDocument();
    expect(screen.getByTestId('editor-help-section-flow')).toBeInTheDocument();
    expect(screen.getByTestId('editor-help-section-checklist')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<EditorHelpDrawer open onClose={() => {}} />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('ESC key triggers onClose', () => {
    const onClose = vi.fn();
    render(<EditorHelpDrawer open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click on backdrop triggers onClose', () => {
    const onClose = vi.fn();
    render(<EditorHelpDrawer open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('editor-help-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click on the panel body does NOT trigger onClose (stop propagation)', () => {
    const onClose = vi.fn();
    render(<EditorHelpDrawer open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('editor-help-drawer'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('close button triggers onClose', () => {
    const onClose = vi.fn();
    render(<EditorHelpDrawer open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('editor-help-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
