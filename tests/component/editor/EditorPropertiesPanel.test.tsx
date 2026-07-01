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

  it('committing one field does not clobber an in-flight edit in another field (F4 regression)', () => {
    // Regression (F4): the LevelMetadataForm re-sync useEffect used to
    // depend on `level.rules` / `level.size`, so committing width (which
    // builds a new rules object) re-ran the effect and reset the
    // still-in-flight initialTime local state back to the store value.
    // Both edits must land.
    render(<EditorPropertiesPanel />);
    act(() => {
      fireEvent.change(screen.getByTestId('meta-width'), { target: { value: '12' } });
      fireEvent.change(screen.getByTestId('meta-initial-time'), { target: { value: '90' } });
    });
    act(() => vi.advanceTimersByTime(300));
    const state = useEditorStore.getState().level;
    expect(state.size.width).toBe(12);
    expect(state.rules.initialTime).toBe(90);
  });

  it('LevelMetadataForm re-syncs all fields when a new level is loaded (F4 still syncs on identity change)', () => {
    // Counterpart to the F4 regression: we intentionally KEEP the sync
    // behavior for level identity changes, so loading a different level
    // (different id) must repopulate the form with the new values.
    const { rerender } = render(<EditorPropertiesPanel />);
    // User edits width on the first level.
    act(() => {
      fireEvent.change(screen.getByTestId('meta-width'), { target: { value: '12' } });
    });
    // Load a new level via the store.
    act(() => {
      useEditorStore.setState({
        level: makeMaze({
          id: 'other-level',
          name: 'Other',
          size: { width: 9, depth: 8 },
          rules: { initialTime: 45, maxHealth: 5, victory: 'time-trial', timeOnPickup: 3 },
        }),
      });
    });
    rerender(<EditorPropertiesPanel />);
    expect((screen.getByTestId('meta-name') as HTMLInputElement).value).toBe('Other');
    expect((screen.getByTestId('meta-width') as HTMLInputElement).value).toBe('9');
    expect((screen.getByTestId('meta-depth') as HTMLInputElement).value).toBe('8');
    expect((screen.getByTestId('meta-initial-time') as HTMLInputElement).value).toBe('45');
    expect((screen.getByTestId('meta-max-health') as HTMLInputElement).value).toBe('5');
    expect((screen.getByTestId('meta-time-on-pickup') as HTMLInputElement).value).toBe('3');
  });

  it('change of victory radio calls updateRule with the new value', () => {
    render(<EditorPropertiesPanel />);
    fireEvent.click(screen.getByTestId('meta-victory-time-trial'));
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.rules.victory).toBe('time-trial');
  });

  // F-2026-06-30: 'caught-by-enemy' is teaching-only. The Segmented
  // control must not show that option for a level without
  // `tutorialSteps` — otherwise an author could pick "win on death"
  // for a normal level and only find out at save time.
  it("hides the 'caught-by-enemy' victory option when the level has no tutorial steps", () => {
    render(<EditorPropertiesPanel />);
    expect(screen.queryByTestId('meta-victory-caught-by-enemy')).toBeNull();
  });

  it("shows the 'caught-by-enemy' victory option for a level with tutorial steps", () => {
    // teaching-03 is the 哨兵回廊 lesson; the option is legitimate there.
    resetEditor(
      makeMaze({
        tutorialSteps: [
          {
            id: 's1',
            messageKey: 'tutorial.steps.s1',
            trigger: { type: 'reached-exit' },
          },
        ],
      }),
    );
    render(<EditorPropertiesPanel />);
    expect(screen.getByTestId('meta-victory-caught-by-enemy')).toBeInTheDocument();
  });

  it("falls back to 'reach-exit' when tutorial steps are removed while caught-by-enemy was selected", () => {
    // Start as a teaching level with caught-by-enemy, then strip the
    // tutorial steps. The local `victory` state must reset to a value
    // that's still in the filtered options list, otherwise the
    // Segmented renders with `aria-checked=false` everywhere.
    resetEditor(
      makeMaze({
        rules: { initialTime: 60, maxHealth: 3, victory: 'caught-by-enemy', timeOnPickup: 10 },
        tutorialSteps: [
          {
            id: 's1',
            messageKey: 'tutorial.steps.s1',
            trigger: { type: 'reached-exit' },
          },
        ],
      }),
    );
    const { rerender } = render(<EditorPropertiesPanel />);
    // Now strip the tutorial steps via the store (the editor's tutorial
    // card UI calls this exact action).
    act(() => {
      useEditorStore.getState().setTutorialSteps(undefined);
    });
    // Re-render so the new level.tutorialSteps reaches LevelMetadataForm.
    // The LevelMetadataForm effect that resets the local `victory` state
    // to 'reach-exit' runs in the same tick — wrap in act() so React
    // flushes the synchronous setVictory before the assertion.
    rerender(<EditorPropertiesPanel />);
    // The committed store value must NOT still be 'caught-by-enemy' —
    // validateMaze would reject it on the next save.
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.rules.victory).toBe('reach-exit');
  });

  it('change of initialTime calls updateRule with the new value', () => {
    render(<EditorPropertiesPanel />);
    fireEvent.change(screen.getByTestId('meta-initial-time'), { target: { value: '90' } });
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.rules.initialTime).toBe(90);
  });

  // F-2026-06-16-M-3: validator requires initialTime > 0 and
  // timeOnPickup > 0. The UI used to clamp to `Math.max(0, ...)` which
  // let the user type 0 and produce an unsaveable level — validateMaze
  // would reject at save time with no hint about which field was the
  // problem. Mirror the validator's lower bound in the editor so the
  // 0 → 1 bump is silent and immediate.
  it('initialTime input clamps to >= 1 (validator parity)', () => {
    render(<EditorPropertiesPanel />);
    fireEvent.change(screen.getByTestId('meta-initial-time'), { target: { value: '0' } });
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.rules.initialTime).toBe(1);
  });

  it('timeOnPickup input clamps to >= 1 (validator parity)', () => {
    render(<EditorPropertiesPanel />);
    fireEvent.change(screen.getByTestId('meta-time-on-pickup'), { target: { value: '0' } });
    act(() => vi.advanceTimersByTime(300));
    expect(useEditorStore.getState().level.rules.timeOnPickup).toBe(1);
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
    fireEvent.click(screen.getByText('删除道具'));
    expect(useEditorStore.getState().level.pickups).toEqual([]);
  });

  // F-P2-9: default coord for "+ node" used to be `enemy.x, enemy.z`
  // (spawn), producing a zero-length path segment. New behaviour
  // extends one cell past the last node along the last-segment
  // direction. Path [(2,2), (3,2)] → last segment +x → new node (4,2).
  it('enemy path node add button extends one cell past the last node (no zero-length segment)', () => {
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
    const path = useEditorStore.getState().level.enemies[0]!.path;
    expect(path).toHaveLength(3);
    expect(path[2]).toEqual({ x: 4, z: 2 });
    // Regression: the new node must NOT be the spawn coords.
    expect(path[2]).not.toEqual({ x: 2, z: 2 });
  });

  it('enemy path node add button falls back to spawn when the extension would land OOB', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      // Last segment goes +x, last node is at the right edge.
      path: [{ x: 2, z: 2 }, { x: 4, z: 2 }],
    };
    resetEditor(makeMaze({ enemies: [enemy] }));
    useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
    render(<EditorPropertiesPanel />);
    fireEvent.click(screen.getByTestId('enemy-path-add'));
    // The store's addEnemyNode rejects OOB coords (width=5 → x+1=5 invalid),
    // so path length stays 2.
    const path = useEditorStore.getState().level.enemies[0]!.path;
    expect(path).toHaveLength(2);
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

  // F-2026-06-16-H-3: NaN guard on the enemy path-node input. A blank or
  // letter keystroke produces NaN/0 from `Number(...)`; the guard drops
  // the keystroke so the store never holds a poisoned NaN coordinate.
  //
  // M-62: the original test only covered the 'abc' case. Edge cases
  // that the same guard must also reject: empty string (cleared input)
  // and pure whitespace. Note that hex / exponential-notation input is
  // already rejected at the DOM layer because the input has
  // `type="number"` — the browser strips the 'x' / overflows to
  // Infinity, and valueAsNumber becomes either 0 (a valid finite
  // number) or Infinity (rejected by the guard). The '0x10' case
  // therefore correctly produces x=0 in the store; we don't pin it as
  // a "rejected" case.
  it('enemy path node input rejects non-numeric input (no NaN in store)', () => {
    const enemy: EnemySpawn = {
      id: 'e1',
      x: 2,
      z: 2,
      path: [{ x: 2, z: 2 }, { x: 3, z: 2 }],
    };
    const cases: ReadonlyArray<{ value: string; label: string }> = [
      { value: 'abc', label: 'letter keystroke' },
      { value: '', label: 'empty string (cleared input)' },
      { value: '   ', label: 'whitespace only' },
    ];
    for (const { value, label } of cases) {
      // Fresh state per case so the assertion below isn't biased by a
      // prior mutation that already moved the coordinate.
      resetEditor(makeMaze({ enemies: [enemy] }));
      useEditorStore.setState({ selection: { kind: 'enemy', id: 'e1' } });
      const { unmount } = render(<EditorPropertiesPanel />);
      fireEvent.change(screen.getByTestId('enemy-path-x-1'), { target: { value } });
      const pathAfter = useEditorStore.getState().level.enemies[0]!.path[1]!;
      // Finite, and the pre-edit value (3) is preserved — the guard
      // dropped the keystroke before it could poison the store.
      expect(Number.isFinite(pathAfter.x), `case "${label}" produced non-finite x`).toBe(true);
      expect(pathAfter.x, `case "${label}" mutated the stored coordinate`).toBe(3);
      unmount();
    }
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

  it('wall Delete button calls deleteSelected (carves the wall back to floor)', () => {
    useEditorStore.setState({ level: makeMaze() });
    // Place a wall at (1, 2) the user wants to remove via Delete.
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
    // F-2026-06-18: deleteSelected on a wall kind must flip the cell
    // from 1 (wall) to 0 (floor). The previous assertion expected 1,
    // which made the panel's "删除墙体" button a silent no-op for any
    // selected wall.
    expect(useEditorStore.getState().level.walls[2]![1]).toBe(0);
  });

  // F-editor-back-to-level: when an object is selected, the user can
  // click "← 关卡属性" to return to the level-metadata form. Previously
  // the only way out was to deselect via the viewport, which the user
  // might not realise exists.
  describe('Back to level affordance', () => {
    it('does NOT render the back button when nothing is selected', () => {
      render(<EditorPropertiesPanel />);
      expect(screen.queryByTestId('back-to-level')).toBeNull();
    });

    it('renders the back button on the pickup form and clicking it clears the selection', () => {
      const pickup: Pickup = { id: 'p1', x: 1, z: 1, type: 'health', value: 5 };
      resetEditor(makeMaze({ pickups: [pickup] }));
      useEditorStore.setState({ selection: { kind: 'pickup', id: 'p1' } });
      render(<EditorPropertiesPanel />);
      expect(screen.getByTestId('pickup-form')).toBeInTheDocument();
      const back = screen.getByTestId('back-to-level');
      expect(back).toBeInTheDocument();
      expect(back.textContent).toContain('关卡属性');
      fireEvent.click(back);
      expect(useEditorStore.getState().selection).toBeNull();
      // After clearSelection, the panel re-renders LevelMetadataForm.
      expect(screen.getByTestId('level-metadata-form')).toBeInTheDocument();
    });

    it('renders the back button on the enemy form and clicking it clears the selection', () => {
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
      fireEvent.click(screen.getByTestId('back-to-level'));
      expect(useEditorStore.getState().selection).toBeNull();
      expect(screen.getByTestId('level-metadata-form')).toBeInTheDocument();
    });

    it('renders the back button on the wall form and clicking it clears the selection', () => {
      useEditorStore.setState({ selection: { kind: 'wall', x: 1, z: 2 } });
      render(<EditorPropertiesPanel />);
      expect(screen.getByTestId('wall-form')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('back-to-level'));
      expect(useEditorStore.getState().selection).toBeNull();
      expect(screen.getByTestId('level-metadata-form')).toBeInTheDocument();
    });
  });
});
