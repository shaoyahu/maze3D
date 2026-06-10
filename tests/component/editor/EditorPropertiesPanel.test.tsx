import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { EditorPropertiesPanel } from '../../../src/ui/editor/EditorPropertiesPanel';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';
import type { EnemySpawn, MazeData, Pickup } from '../../../src/maze/types';

function makeMaze(overrides: Partial<MazeData> = {}): MazeData {
  return {
    id: 'test-level',
    name: 'Test',
    size: { width: 5, depth: 4 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 4, z: 3 },
    walls: [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ],
    pickups: [],
    enemies: [],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
    ...overrides,
  };
}

function resetEditor(level: MazeData = makeMaze()): void {
  localStorage.clear();
  useLevelStore.setState({ customLevels: {} });
  useEditorStore.setState({
    level,
    tool: 'select',
    selection: null,
    camera: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    dirty: false,
  });
}

describe('EditorPropertiesPanel (P2-4b #12)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEditor();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the level metadata form when nothing is selected', () => {
    render(<EditorPropertiesPanel />);
    expect(screen.getByTestId('level-metadata-form')).toBeInTheDocument();
    expect(screen.getByTestId('meta-name')).toBeInTheDocument();
  });

  it('renders the pickup form when a pickup is selected', () => {
    const pickup: Pickup = { id: 'p1', x: 1, z: 1, type: 'health', value: 5 };
    resetEditor(makeMaze({ pickups: [pickup] }));
    useEditorStore.setState({ selection: { kind: 'pickup', id: 'p1' } });
    render(<EditorPropertiesPanel />);
    expect(screen.getByTestId('pickup-form')).toBeInTheDocument();
    expect(screen.getByTestId('pickup-type')).toBeInTheDocument();
    expect(screen.getByTestId('pickup-value')).toBeInTheDocument();
  });

  it('renders the enemy form when an enemy is selected', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }],
    };
    resetEditor(makeMaze({ enemies: [enemy] }));
    useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
    render(<EditorPropertiesPanel />);
    expect(screen.getByTestId('enemy-form')).toBeInTheDocument();
    expect(screen.getByTestId('enemy-path-node-0')).toBeInTheDocument();
    expect(screen.getByTestId('enemy-path-node-1')).toBeInTheDocument();
    expect(screen.getByTestId('enemy-path-add')).toBeInTheDocument();
  });

  it('renders the wall form when a wall cell is selected', () => {
    useEditorStore.setState({ selection: { kind: 'wall', x: 1, z: 1 } });
    render(<EditorPropertiesPanel />);
    expect(screen.getByTestId('wall-form')).toBeInTheDocument();
  });

  it('shows a "missing" message when the selected pickup no longer exists', () => {
    useEditorStore.setState({ selection: { kind: 'pickup', id: 'gone' } });
    render(<EditorPropertiesPanel />);
    expect(screen.getByText(/已不存在/)).toBeInTheDocument();
  });

  it('change of name debounces and calls updateName after 300ms', () => {
    render(<EditorPropertiesPanel />);
    fireEvent.change(screen.getByTestId('meta-name'), { target: { value: 'New Name' } });
    // Before debounce: store not yet updated.
    expect(useEditorStore.getState().level.name).toBe('Test');
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.name).toBe('New Name');
  });

  it('change of width debounces and calls updateSize with clamped value', () => {
    render(<EditorPropertiesPanel />);
    act(() => {
      fireEvent.change(screen.getByTestId('meta-width'), { target: { value: '12' } });
    });
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.size.width).toBe(12);
  });

  it('changing width and depth in the same debounce window does not race (regression)', () => {
    // Regression: the width and depth debounced commits used to read each
    // other's dimension from the closure, so whichever timer fired second
    // would overwrite the first edit. Both fields must stick.
    render(<EditorPropertiesPanel />);
    act(() => {
      fireEvent.change(screen.getByTestId('meta-width'), { target: { value: '12' } });
      fireEvent.change(screen.getByTestId('meta-depth'), { target: { value: '7' } });
    });
    act(() => vi.advanceTimersByTime(300));
    const size = useEditorStore.getState().level.size;
    expect(size).toEqual({ width: 12, depth: 7 });
  });

  it('change of victory radio calls updateRule with the new value', () => {
    render(<EditorPropertiesPanel />);
    fireEvent.click(screen.getByTestId('meta-victory-time-trial'));
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.rules.victory).toBe('time-trial');
  });

  it('change of initialTime calls updateRule with the new value', () => {
    render(<EditorPropertiesPanel />);
    fireEvent.change(screen.getByTestId('meta-initial-time'), { target: { value: '90' } });
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.rules.initialTime).toBe(90);
  });

  it('change of pickup type debounces and calls updatePickup', () => {
    const pickup: Pickup = { id: 'p1', x: 1, z: 1, type: 'health', value: 5 };
    resetEditor(makeMaze({ pickups: [pickup] }));
    useEditorStore.setState({ selection: { kind: 'pickup', id: 'p1' } });
    render(<EditorPropertiesPanel />);
    fireEvent.change(screen.getByTestId('pickup-type'), { target: { value: 'key' } });
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.pickups[0]!.type).toBe('key');
  });

  it('change of pickup value debounces and calls updatePickup', () => {
    const pickup: Pickup = { id: 'p1', x: 1, z: 1, type: 'time', value: 5 };
    resetEditor(makeMaze({ pickups: [pickup] }));
    useEditorStore.setState({ selection: { kind: 'pickup', id: 'p1' } });
    render(<EditorPropertiesPanel />);
    fireEvent.change(screen.getByTestId('pickup-value'), { target: { value: '20' } });
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.pickups[0]!.value).toBe(20);
  });

  it('pickup Delete button calls deleteSelected', () => {
    const pickup: Pickup = { id: 'p1', x: 1, z: 1, type: 'time', value: 5 };
    resetEditor(makeMaze({ pickups: [pickup] }));
    useEditorStore.setState({ selection: { kind: 'pickup', id: 'p1' } });
    render(<EditorPropertiesPanel />);
    fireEvent.click(screen.getByText('删除拾取物'));
    expect(useEditorStore.getState().level.pickups).toEqual([]);
  });

  it('enemy path node add button calls addEnemyNode', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }],
    };
    resetEditor(makeMaze({ enemies: [enemy] }));
    useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
    render(<EditorPropertiesPanel />);
    fireEvent.click(screen.getByTestId('enemy-path-add'));
    expect(useEditorStore.getState().level.enemies[0]!.path).toHaveLength(3);
  });

  it('enemy path node remove button (when >2 nodes) calls removeEnemyNode', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 3 }],
    };
    resetEditor(makeMaze({ enemies: [enemy] }));
    useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
    render(<EditorPropertiesPanel />);
    fireEvent.click(screen.getByTestId('enemy-path-remove-2'));
    expect(useEditorStore.getState().level.enemies[0]!.path).toHaveLength(2);
  });

  it('enemy path node remove is disabled when only 2 nodes remain', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }],
    };
    resetEditor(makeMaze({ enemies: [enemy] }));
    useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
    render(<EditorPropertiesPanel />);
    expect(screen.getByTestId('enemy-path-remove-0')).toBeDisabled();
    expect(screen.getByTestId('enemy-path-remove-1')).toBeDisabled();
  });

  it('change of enemy xz in path nodes calls moveEnemyNode', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }],
    };
    resetEditor(makeMaze({ enemies: [enemy] }));
    useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
    render(<EditorPropertiesPanel />);
    fireEvent.change(screen.getByTestId('enemy-path-x-1'), { target: { value: '4' } });
    expect(useEditorStore.getState().level.enemies[0]!.path[1]).toEqual({ x: 4, z: 2 });
  });

  it('change of enemy dwell time debounces and calls updateEnemy', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }],
      dwellTime: 1,
    };
    resetEditor(makeMaze({ enemies: [enemy] }));
    useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
    render(<EditorPropertiesPanel />);
    fireEvent.change(screen.getByTestId('enemy-dwell'), { target: { value: '2.5' } });
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.enemies[0]!.dwellTime).toBe(2.5);
  });

  it('enemy Delete button calls deleteSelected', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }],
    };
    resetEditor(makeMaze({ enemies: [enemy] }));
    useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
    render(<EditorPropertiesPanel />);
    fireEvent.click(screen.getByText('删除敌人'));
    expect(useEditorStore.getState().level.enemies).toEqual([]);
  });

  it('wall Delete button calls deleteSelected (restores the wall to 1)', () => {
    useEditorStore.setState({ level: makeMaze() });
    // Make a wall at (1,1) floor the user wants to remove via Delete.
    useEditorStore.setState({
      level: {
        ...useEditorStore.getState().level,
        walls: [
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 1, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
      },
    });
    useEditorStore.setState({ selection: { kind: 'wall', x: 1, z: 2 } });
    render(<EditorPropertiesPanel />);
    fireEvent.click(screen.getByText('删除墙体'));
    expect(useEditorStore.getState().level.walls[2]![1]).toBe(1);
  });
});
