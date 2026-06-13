import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
// a future change can't silently drop it. Together they cover B-L3
// (toolbar aria-controls), B-L21 (file input aria-label), B-L25
// (Button aria-busy), and B-L34 (dirty marker aria-live).
describe('EditorToolbar a11y (P3-Theme 2)', () => {
  beforeEach(() => {
    resetEditor();
  });

  it('toolbar role points at the viewport via aria-controls (B-L3)', () => {
    // Render both the toolbar AND the viewport in the same tree so the
    // aria-controls id actually resolves. AT only benefits from the
    // aria-controls relationship when both nodes coexist on the page.
    render(
      <ConfirmProvider>
        <EditorToolbar />
        <EditorViewport />
      </ConfirmProvider>,
    );
    const toolbar = screen.getByRole('toolbar', { name: 'Editor tools' });
    const controlsId = toolbar.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    // The id must resolve to an actual element on the same page so AT
    // can announce the relationship.
    expect(document.getElementById(controlsId as string)).not.toBeNull();
  });

  it('hidden file input has an aria-label so AT can announce it (B-L21)', () => {
    render(
      <ConfirmProvider>
        <EditorToolbar />
      </ConfirmProvider>,
    );
    const fileInput = screen.getByTestId('tool-import-input');
    expect(fileInput.getAttribute('aria-label')).toMatch(/导入|import/i);
  });

  it('dirty marker has role=status and aria-live so save-state changes are announced (B-L34)', () => {
    useEditorStore.setState({ dirty: true });
    render(
      <ConfirmProvider>
        <EditorToolbar />
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