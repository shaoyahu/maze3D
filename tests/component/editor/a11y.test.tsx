import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditorTopBar } from '../../../src/ui/editor/EditorTopBar';
import { EditorToolbar } from '../../../src/ui/editor/EditorToolbar';
import { EditorViewport } from '../../../src/ui/editor/EditorViewport';
import { Button } from '../../../src/ui/components/Button';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';
import { ConfirmProvider } from '../../../src/ui/useConfirm';

function resetEditor(): void {
  localStorage.clear();
  useLevelStore.setState({ customLevels: {} });
  useEditorStore.setState({
    level: {
      id: 'custom-test-id',
      name: 'Test',
      size: { width: 5, depth: 4 },
      cellSize: 2,
      start: { x: 0, z: 0 },
      exit: { x: 4, z: 3 },
      walls: [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
      pickups: [],
      enemies: [],
      rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
    },
    tool: 'select',
    selection: null,
    camera: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    dirty: false,
  });
}

// P3-Theme 2 — a11y hardening: each test pins one assistive-tech hook so
// a future change can't silently drop it. After the P3-Phase-2 split, the
// topbar no longer carries `role="toolbar"` (the toolbar role moved to
// the LeftDrawer, and the TopBar is now `role="banner"`). The dirty
// marker, the file-input aria-label, and the aria-controls relationship
// all live in the new EditorTopBar.
describe('EditorTopBar a11y (P3-Theme 2)', () => {
  beforeEach(() => {
    resetEditor();
  });

  it('EditorToolbar exposes role=toolbar with aria-label "Editor tools" (B-L3, post-split)', () => {
    // P2-13: 工具从 LeftDrawer 搬到中央上方的 EditorToolbar,role/aria-label 不变。
    render(
      <ConfirmProvider>
        <EditorToolbar />
      </ConfirmProvider>,
    );
    const toolbar = screen.getByRole('toolbar', { name: 'Editor tools' });
    expect(toolbar).toBeInTheDocument();
  });

  it('hidden file input has an aria-label so AT can announce it (B-L21)', () => {
    render(
      <ConfirmProvider>
        <EditorTopBar />
      </ConfirmProvider>,
    );
    const fileInput = screen.getByTestId('tool-import-input');
    expect(fileInput.getAttribute('aria-label')).toMatch(/导入|import/i);
  });

  it('dirty marker has role=status and aria-live so save-state changes are announced (B-L34)', () => {
    useEditorStore.setState({ dirty: true });
    render(
      <ConfirmProvider>
        <EditorTopBar />
      </ConfirmProvider>,
    );
    const dirty = screen.getByTestId('tool-dirty');
    expect(dirty.getAttribute('role')).toBe('status');
    expect(dirty.getAttribute('aria-live')).toBe('polite');
  });

  it('editor-viewport element exposes the id referenced by aria-controls', () => {
    render(<EditorViewport />);
    const viewport = screen.getByTestId('editor-viewport');
    expect(viewport.id).toBeTruthy();
  });
});

describe('Button aria-busy (P3-B-L25)', () => {
  it('passes aria-busy through to the rendered <button> when set', () => {
    render(<Button onClick={() => {}} aria-busy data-testid="b">OK</Button>);
    const btn = screen.getByTestId('b');
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('omits aria-busy by default so resting buttons stay quiet', () => {
    render(<Button onClick={() => {}} data-testid="b">OK</Button>);
    const btn = screen.getByTestId('b');
    expect(btn.hasAttribute('aria-busy')).toBe(false);
  });
});
