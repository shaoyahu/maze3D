import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { EditorViewport } from '../../../src/ui/editor/EditorViewport';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';
import type { EnemySpawn, Pickup } from '../../../src/maze/types';

function resetEditor(): void {
  localStorage.clear();
  useLevelStore.setState({ customLevels: {} });
  useEditorStore.setState({
    level: {
      id: 'test-level',
      name: 'Test',
      size: { width: 5, depth: 4 },
      cellSize: 2,
      start: { x: 0, z: 0 },
      exit: { x: 4, z: 3 },
      walls: [
        [0, 0, 0, 0, 0],
        [0, 1, 0, 0, 0],
        [0, 0, 0, 1, 0],
        [0, 0, 0, 0, 0],
      ],
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

describe('EditorViewport (P2-4b #11)', () => {
  beforeEach(() => {
    resetEditor();
  });

  it('renders a 5x4 grid of cells', () => {
    render(<EditorViewport />);
    // 5 cols * 4 rows = 20 cells.
    expect(screen.getAllByTestId(/^cell-/).length).toBe(20);
  });

  it('marks wall cells with data-wall=1 and floor cells with data-wall=0', () => {
    render(<EditorViewport />);
    // (1,1) and (3,2) are walls in the fixture.
    expect(screen.getByTestId('cell-1-1').getAttribute('data-wall')).toBe('1');
    expect(screen.getByTestId('cell-3-2').getAttribute('data-wall')).toBe('1');
    // (0,0) is floor.
    expect(screen.getByTestId('cell-0-0').getAttribute('data-wall')).toBe('0');
  });

  it('marks the start and exit cells with data-start / data-exit', () => {
    render(<EditorViewport />);
    expect(screen.getByTestId('cell-0-0').getAttribute('data-start')).toBe('1');
    expect(screen.getByTestId('cell-4-3').getAttribute('data-exit')).toBe('1');
  });

  it('renders start and exit marker spans at the start and exit cells', () => {
    render(<EditorViewport />);
    expect(screen.getByTestId('start-0-0')).toBeInTheDocument();
    expect(screen.getByTestId('exit-4-3')).toBeInTheDocument();
  });

  it('clicking a wall with the wall tool toggles it to a floor (placeWall)', () => {
    useEditorStore.setState({ tool: 'wall' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-1-1'));
    const lvl = useEditorStore.getState().level;
    expect(lvl.walls[1]![1]).toBe(0);
  });

  it('clicking a floor with the wall tool toggles it to a wall', () => {
    useEditorStore.setState({ tool: 'wall' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-0-0'));
    const lvl = useEditorStore.getState().level;
    expect(lvl.walls[0]![0]).toBe(1);
  });

  it('clicking a cell with the start tool moves start to that cell', () => {
    useEditorStore.setState({ tool: 'start' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-1'));
    expect(useEditorStore.getState().level.start).toEqual({ x: 2, z: 1 });
  });

  it('start tool ignores clicks on walls (silent reject — keeps existing start)', () => {
    useEditorStore.setState({ tool: 'start' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-1-1')); // wall
    expect(useEditorStore.getState().level.start).toEqual({ x: 0, z: 0 });
  });

  it('clicking a cell with the exit tool moves exit to that cell', () => {
    useEditorStore.setState({ tool: 'exit' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-2'));
    expect(useEditorStore.getState().level.exit).toEqual({ x: 2, z: 2 });
  });

  it('clicking a cell with the pickup tool adds a pickup to that cell', () => {
    useEditorStore.setState({ tool: 'pickup' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-1'));
    const pickups = useEditorStore.getState().level.pickups;
    expect(pickups).toHaveLength(1);
    expect(pickups[0]).toMatchObject({ x: 2, z: 1, type: 'time', value: 10 });
    expect(pickups[0]!.id).toBeTruthy();
  });

  it('clicking a cell with the enemy tool adds an enemy with a 2-point path', () => {
    useEditorStore.setState({ tool: 'enemy' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-1-1'));
    const enemies = useEditorStore.getState().level.enemies;
    expect(enemies).toHaveLength(1);
    expect(enemies[0]).toMatchObject({ x: 1, z: 1 });
    expect(enemies[0]!.path).toEqual([
      { x: 1, z: 1 },
      { x: 2, z: 1 },
    ]);
  });

  it('select tool on a wall cell selects the wall', () => {
    useEditorStore.setState({ tool: 'select' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-1-1'));
    expect(useEditorStore.getState().selection).toEqual({ kind: 'wall', x: 1, z: 1 });
  });

  it('select tool on a floor cell clears the selection', () => {
    useEditorStore.setState({
      tool: 'select',
      selection: { kind: 'wall', x: 1, z: 1 },
    });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-0-0'));
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it('select tool on a cell with a pickup selects the pickup', () => {
    const pickup: Pickup = { id: 'p1', x: 2, z: 1, type: 'health', value: 1 };
    useEditorStore.setState({
      tool: 'select',
      level: { ...useEditorStore.getState().level, pickups: [pickup] },
    });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-1'));
    expect(useEditorStore.getState().selection).toEqual({ kind: 'pickup', id: 'p1' });
  });

  it('select tool on a cell with an enemy selects the enemy', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }],
    };
    useEditorStore.setState({
      tool: 'select',
      level: { ...useEditorStore.getState().level, enemies: [enemy] },
    });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-2'));
    expect(useEditorStore.getState().selection).toEqual({ kind: 'enemy', id: 'e1' });
  });

  it('renders pickup, enemy body, path polyline, and path nodes for placed entities', () => {
    const pickup: Pickup = { id: 'p1', x: 1, z: 0, type: 'time', value: 5 };
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 3 }],
    };
    useEditorStore.setState({
      level: { ...useEditorStore.getState().level, pickups: [pickup], enemies: [enemy] },
    });
    render(<EditorViewport />);
    expect(screen.getByTestId('pickup-p1')).toBeInTheDocument();
    expect(screen.getByTestId('pickup-p1').getAttribute('data-pickup-type')).toBe('time');
    expect(screen.getByTestId('enemy-e1')).toBeInTheDocument();
    expect(screen.getByTestId('path-e1').tagName.toLowerCase()).toBe('polyline');
    // 3 path nodes for the enemy.
    expect(screen.getByTestId('path-node-e1-0')).toBeInTheDocument();
    expect(screen.getByTestId('path-node-e1-1')).toBeInTheDocument();
    expect(screen.getByTestId('path-node-e1-2')).toBeInTheDocument();
  });

  it('wheel-up increases camera.zoom (clamped to ZOOM_MAX)', () => {
    render(<EditorViewport />);
    // Many wheel-ups should cap at 3.
    for (let i = 0; i < 40; i += 1) {
      fireEvent.wheel(screen.getByTestId('editor-viewport'), { deltaY: -100 });
    }
    expect(useEditorStore.getState().camera.zoom).toBe(3);
  });

  it('wheel-down decreases camera.zoom (clamped to ZOOM_MIN)', () => {
    render(<EditorViewport />);
    for (let i = 0; i < 40; i += 1) {
      fireEvent.wheel(screen.getByTestId('editor-viewport'), { deltaY: 100 });
    }
    expect(useEditorStore.getState().camera.zoom).toBe(0.5);
  });

  it('right-mouse drag updates camera.x / camera.y', () => {
    render(<EditorViewport />);
    const vp = screen.getByTestId('editor-viewport');
    fireEvent.mouseDown(vp, { button: 2, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(vp, { button: 2, clientX: 150, clientY: 80 });
    fireEvent.mouseUp(vp, { button: 2, clientX: 150, clientY: 80 });
    const cam = useEditorStore.getState().camera;
    expect(cam.x).toBe(50);
    expect(cam.y).toBe(-20);
  });

  it('left-mouse drag does NOT pan (right button only)', () => {
    render(<EditorViewport />);
    const vp = screen.getByTestId('editor-viewport');
    fireEvent.mouseDown(vp, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(vp, { button: 0, clientX: 150, clientY: 80 });
    fireEvent.mouseUp(vp, { button: 0, clientX: 150, clientY: 80 });
    expect(useEditorStore.getState().camera).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
