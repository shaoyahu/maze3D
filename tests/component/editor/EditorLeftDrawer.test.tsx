import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { EditorLeftDrawer } from '../../../src/ui/editor/EditorLeftDrawer';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';

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

// F-P2-9: the drawer now owns 8 tool buttons (added 'erase').
describe('EditorLeftDrawer (P2-9: 8 tools + erase)', () => {
  beforeEach(() => {
    resetEditor();
  });

  it('renders all 8 tool buttons', () => {
    render(<EditorLeftDrawer />);
    expect(screen.getByTestId('tool-select')).toBeInTheDocument();
    expect(screen.getByTestId('tool-wall')).toBeInTheDocument();
    expect(screen.getByTestId('tool-erase')).toBeInTheDocument();
    expect(screen.getByTestId('tool-start')).toBeInTheDocument();
    expect(screen.getByTestId('tool-exit')).toBeInTheDocument();
    expect(screen.getByTestId('tool-pickup')).toBeInTheDocument();
    expect(screen.getByTestId('tool-enemy')).toBeInTheDocument();
    expect(screen.getByTestId('tool-pan')).toBeInTheDocument();
  });

  it('marks the active tool with aria-pressed=true', () => {
    useEditorStore.setState({ tool: 'wall' });
    render(<EditorLeftDrawer />);
    expect(screen.getByTestId('tool-wall').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tool-select').getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking a tool button dispatches setTool', () => {
    render(<EditorLeftDrawer />);
    fireEvent.click(screen.getByTestId('tool-pickup'));
    expect(useEditorStore.getState().tool).toBe('pickup');
  });

  it('clicking the new erase button dispatches setTool(erase)', () => {
    render(<EditorLeftDrawer />);
    fireEvent.click(screen.getByTestId('tool-erase'));
    expect(useEditorStore.getState().tool).toBe('erase');
  });

  it('Undo is disabled when past is empty', () => {
    render(<EditorLeftDrawer />);
    expect(screen.getByTestId('tool-undo')).toBeDisabled();
  });

  it('Redo is disabled when future is empty', () => {
    render(<EditorLeftDrawer />);
    expect(screen.getByTestId('tool-redo')).toBeDisabled();
  });

  it('Undo is enabled when past is non-empty and triggers undo on click', () => {
    const pastLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ past: [{ level: pastLevel, selection: null }] });
    render(<EditorLeftDrawer />);
    expect(screen.getByTestId('tool-undo')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('tool-undo'));
    expect(useEditorStore.getState().past.length).toBe(0);
  });

  it('Redo is enabled when future is non-empty and triggers redo on click', () => {
    const futureLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ future: [{ level: futureLevel, selection: null }] });
    render(<EditorLeftDrawer />);
    expect(screen.getByTestId('tool-redo')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('tool-redo'));
    expect(useEditorStore.getState().future.length).toBe(0);
  });
});
