import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { EditorViewport } from '../../../src/ui/editor/EditorViewport';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';
import type { EnemySpawn, Pickup, Trap, Door } from '../../../src/maze/types';

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
      traps: [],
      doors: [],
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

  // F-P2-9: placeWall is now strictly set-to-1 (no toggle). A click on
  // an already-wall cell is a no-op (was "toggles 1→0" in the buggy
  // toggle implementation that contradicted the toolbar label).
  it('clicking an existing wall with the wall tool is a no-op (set-to-1)', () => {
    useEditorStore.setState({ tool: 'wall' });
    render(<EditorViewport />);
    // (1,1) is a wall in the default fixture.
    fireEvent.click(screen.getByTestId('cell-1-1'));
    const lvl = useEditorStore.getState().level;
    expect(lvl.walls![1]![1]).toBe(1);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it('clicking a floor with the wall tool sets it to a wall', () => {
    useEditorStore.setState({ tool: 'wall' });
    render(<EditorViewport />);
    // (1,0) is a floor in the fixture, but not the start (0,0) or exit
    // (4,3) — placeWall silently rejects start/exit cells.
    fireEvent.click(screen.getByTestId('cell-1-0'));
    const lvl = useEditorStore.getState().level;
    expect(lvl.walls![0]![1]).toBe(1);
    expect(useEditorStore.getState().past).toHaveLength(1);
  });

  // F-2026-06-12-H2 + P2-9: regression test — clicking the start cell with the
  // wall tool must NOT place a wall on it. The guard in `placeWall`
  // silently rejects the click so the level remains saveable. Verify
  // both that the wall is unchanged AND that no history/dirty side
  // effect leaked through.
  it('wall tool refuses to wall the start cell (level remains saveable)', () => {
    useEditorStore.setState({ tool: 'wall' });
    render(<EditorViewport />);
    // Act
    fireEvent.click(screen.getByTestId('cell-0-0'));
    // Assert — the start cell (0,0) is still a floor.
    const lvl = useEditorStore.getState().level;
    expect(lvl.walls![0]![0]).toBe(0);
    // And no history entry was created.
    expect(useEditorStore.getState().past).toHaveLength(0);
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  // F-P2-9: dedicated erase tool. Inverse of wall: 1→0.
  it('clicking a wall with the erase tool sets it to a floor (placeErase)', () => {
    useEditorStore.setState({ tool: 'erase' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-1-1'));
    const lvl = useEditorStore.getState().level;
    expect(lvl.walls![1]![1]).toBe(0);
    expect(useEditorStore.getState().past).toHaveLength(1);
  });

  it('clicking a floor with the erase tool is a no-op', () => {
    useEditorStore.setState({ tool: 'erase' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-1-0'));
    const lvl = useEditorStore.getState().level;
    expect(lvl.walls![0]![1]).toBe(0);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it('erase tool refuses to erase the start cell', () => {
    useEditorStore.setState({ tool: 'erase' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-0-0'));
    expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.eraseOnStart');
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it('erase tool refuses to erase the exit cell', () => {
    useEditorStore.setState({ tool: 'erase' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-4-3'));
    expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.eraseOnExit');
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it('clicking a cell with the start tool moves start to that cell', () => {
    useEditorStore.setState({ tool: 'start' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-1'));
    // P3-1: editor store now writes start.level alongside x/z.
    expect(useEditorStore.getState().level.start).toEqual({ x: 2, z: 1, level: 0 });
  });

  it('start tool on a wall cell auto-carves the wall and moves the start there', () => {
    // P3-Phase-2 fix: previously the click was silent-rejected. Now the
    // user can drop the start on top of a wall and the cell is carved
    // to floor — the legacy test pinned the silent-reject behaviour.
    useEditorStore.setState({ tool: 'start' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-1-1')); // wall in fixture
    const lvl = useEditorStore.getState().level;
    // P3-1: editor store writes start.level = 0 alongside x/z.
    expect(lvl.start).toEqual({ x: 1, z: 1, level: 0 });
    expect(lvl.walls![1]![1]).toBe(0);
  });

  it('clicking a cell with the exit tool moves exit to that cell', () => {
    useEditorStore.setState({ tool: 'exit' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-2'));
    // P3-1: editor store now writes exit.level alongside x/z.
    expect(useEditorStore.getState().level.exit).toEqual({ x: 2, z: 2, level: 0 });
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
    // M-66: drop the 60-iteration loop in favour of a minimal pair
    // that pins the actual ZOOM_STEP behaviour. From the default
    // zoom=1, ZOOM_STEP=0.1, so 40 wheel-ups overshoot the cap and
    // pin the upper clamp at 5. F-2026-06-18 widened the editor zoom
    // range from [0.5, 3] to [0.25, 5]. Use toBeCloseTo (not toBe)
    // because 40 × 0.1 = 5 in math but IEEE 754 lands on
    // 4.999999999999999.
    for (let i = 0; i < 40; i += 1) {
      fireEvent.wheel(screen.getByTestId('editor-viewport'), { deltaY: -100 });
    }
    expect(useEditorStore.getState().camera.zoom).toBeCloseTo(5, 5);
    // One more wheel-up should still clamp to 5.
    fireEvent.wheel(screen.getByTestId('editor-viewport'), { deltaY: -100 });
    expect(useEditorStore.getState().camera.zoom).toBe(5);
  });

  it('wheel-down decreases camera.zoom (clamped to ZOOM_MIN)', () => {
    render(<EditorViewport />);
    // M-66: minimal pair that pins the lower clamp. F-2026-06-18
    // floor is 0.25.
    for (let i = 0; i < 10; i += 1) {
      fireEvent.wheel(screen.getByTestId('editor-viewport'), { deltaY: 100 });
    }
    expect(useEditorStore.getState().camera.zoom).toBeCloseTo(0.25, 5);
    // One more wheel-down should still clamp to 0.25.
    fireEvent.wheel(screen.getByTestId('editor-viewport'), { deltaY: 100 });
    expect(useEditorStore.getState().camera.zoom).toBe(0.25);
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

  // F-editor-empty-click-clear: clicking the dark canvas area around the
  // grid (i.e. NOT on a cell) clears the current selection so the right
  // panel jumps back to the level-metadata form. Cell clicks are routed
  // by handleCellClick and continue to behave per-tool.
  describe('clicking empty canvas area clears the selection', () => {
    it('a click on the viewport background (target = the viewport div) clears the selection', () => {
      useEditorStore.setState({ selection: { kind: 'wall', x: 1, z: 1 } });
      render(<EditorViewport />);
      const vp = screen.getByTestId('editor-viewport');
      // Pretend the user pressed and released on the dark padding. The
      // target is the viewport element itself (no data-x / data-z).
      fireEvent.mouseDown(vp, { button: 0, clientX: 5, clientY: 5 });
      fireEvent.mouseUp(vp, { button: 0, clientX: 5, clientY: 5 });
      expect(useEditorStore.getState().selection).toBeNull();
    });

    it('a click on the viewport background works in the wall tool (clears, does NOT place a wall)', () => {
      // User is in wall tool with a wall selected. Clicking the dark
      // area should drop the selection — NOT place a wall at (0,0).
      useEditorStore.setState({
        tool: 'wall',
        selection: { kind: 'wall', x: 1, z: 1 },
      });
      render(<EditorViewport />);
      const before = useEditorStore.getState().level.walls!.map((r) => r.slice());
      const vp = screen.getByTestId('editor-viewport');
      fireEvent.mouseDown(vp, { button: 0, clientX: 5, clientY: 5 });
      fireEvent.mouseUp(vp, { button: 0, clientX: 5, clientY: 5 });
      expect(useEditorStore.getState().selection).toBeNull();
      const after = useEditorStore.getState().level.walls!;
      expect(after).toEqual(before);
    });

    it('a click on a cell does NOT clear the selection (cell handler is the one that runs)', () => {
      // With select tool, clicking a wall cell should select the wall,
      // not clear the prior selection. The viewport-level handler
      // correctly skips clicks whose target is a cell.
      useEditorStore.setState({
        tool: 'select',
        selection: { kind: 'wall', x: 1, z: 1 },
      });
      render(<EditorViewport />);
      fireEvent.click(screen.getByTestId('cell-3-2')); // a different wall
      expect(useEditorStore.getState().selection).toEqual({ kind: 'wall', x: 3, z: 2 });
    });

    it('a drag (mousedown then move > 5px then mouseup) does NOT clear the selection', () => {
      useEditorStore.setState({ selection: { kind: 'wall', x: 1, z: 1 } });
      render(<EditorViewport />);
      const vp = screen.getByTestId('editor-viewport');
      fireEvent.mouseDown(vp, { button: 0, clientX: 5, clientY: 5 });
      fireEvent.mouseMove(vp, { button: 0, clientX: 50, clientY: 50 });
      fireEvent.mouseUp(vp, { button: 0, clientX: 50, clientY: 50 });
      expect(useEditorStore.getState().selection).toEqual({ kind: 'wall', x: 1, z: 1 });
    });

    it('clicking on the minimap does NOT clear the selection (minimap is outside the viewport click area)', () => {
      useEditorStore.setState({ selection: { kind: 'wall', x: 1, z: 1 } });
      render(<EditorViewport />);
      // The minimap is rendered as a sibling of the viewport div, so
      // clicks on it never reach the viewport's mouseup handler.
      const minimap = screen.getByTestId('editor-viewport-minimap');
      fireEvent.mouseDown(minimap, { button: 0, clientX: 5, clientY: 5 });
      fireEvent.mouseUp(minimap, { button: 0, clientX: 5, clientY: 5 });
      expect(useEditorStore.getState().selection).toEqual({ kind: 'wall', x: 1, z: 1 });
    });

    it('right-button click on the viewport does NOT clear the selection (only left button counts)', () => {
      useEditorStore.setState({ selection: { kind: 'wall', x: 1, z: 1 } });
      render(<EditorViewport />);
      const vp = screen.getByTestId('editor-viewport');
      fireEvent.mouseDown(vp, { button: 2, clientX: 5, clientY: 5 });
      fireEvent.mouseUp(vp, { button: 2, clientX: 5, clientY: 5 });
      expect(useEditorStore.getState().selection).toEqual({ kind: 'wall', x: 1, z: 1 });
    });
  });

  // F-2026-06-16-L-2: when the help drawer is open, ESC is owned by
  // the drawer (closes it). The viewport's document-level listener
  // must NOT also fire its reset-action, or one ESC key produces two
  // visible effects: drawer closes + selection clears + tool resets.
  describe('ESC key (global handler)', () => {
    it('clears the selection and resets the tool to "select" when no drawer is open', () => {
      useEditorStore.setState({ selection: { kind: 'wall', x: 1, z: 1 }, tool: 'wall' });
      render(<EditorViewport />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(useEditorStore.getState().selection).toBeNull();
      expect(useEditorStore.getState().tool).toBe('select');
    });

    it('does NOT reset the selection or tool when the help drawer is open (L-2)', () => {
      useEditorStore.setState({ selection: { kind: 'wall', x: 1, z: 1 }, tool: 'wall' });
      render(<EditorViewport />);
      // Open the help drawer via its toggle button.
      fireEvent.click(screen.getByTestId('editor-help-toggle'));
      // ESC while the drawer is open must be a no-op for the viewport
      // handler — the drawer's own listener is responsible for closing
      // the drawer; the viewport must not also fire.
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(useEditorStore.getState().selection).toEqual({ kind: 'wall', x: 1, z: 1 });
      expect(useEditorStore.getState().tool).toBe('wall');
    });
  });

  // P2-18: trap + door tool tests
  it('clicking a floor cell with the trap tool adds a trap to that cell', () => {
    useEditorStore.setState({ tool: 'trap' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-1'));
    const traps = useEditorStore.getState().level.traps;
    expect(traps).toHaveLength(1);
    expect(traps[0]).toMatchObject({ x: 2, z: 1, kind: 'fire', damage: 1 });
    expect(traps[0]!.id).toBeTruthy();
  });

  it('trap tool on a wall cell is a no-op and sets lastErrorKey', () => {
    useEditorStore.setState({ tool: 'trap' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-1-1'));
    expect(useEditorStore.getState().level.traps).toHaveLength(0);
    expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.trapOnWall');
  });

  it('clicking a floor cell with the door tool adds a door to that cell', () => {
    useEditorStore.setState({ tool: 'door' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-1'));
    const doors = useEditorStore.getState().level.doors;
    expect(doors).toHaveLength(1);
    expect(doors[0]).toMatchObject({ x: 2, z: 1, keyColor: 'red' });
    expect(doors[0]!.id).toBeTruthy();
  });

  it('door tool on a wall cell is a no-op and sets lastErrorKey', () => {
    useEditorStore.setState({ tool: 'door' });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-1-1'));
    expect(useEditorStore.getState().level.doors).toHaveLength(0);
    expect(useEditorStore.getState().lastErrorKey).toBe('editor.lastError.doorOnWall');
  });

  it('select tool on a cell with a trap selects the trap', () => {
    const trap: Trap = { id: 'trap-1', x: 2, z: 1, kind: 'fire', damage: 1 };
    useEditorStore.setState({
      tool: 'select',
      level: { ...useEditorStore.getState().level, traps: [trap] },
    });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-1'));
    expect(useEditorStore.getState().selection).toEqual({ kind: 'trap', id: 'trap-1' });
  });

  it('select tool on a cell with a door selects the door', () => {
    const door: Door = { id: 'door-1', x: 2, z: 1, keyColor: 'blue' };
    useEditorStore.setState({
      tool: 'select',
      level: { ...useEditorStore.getState().level, doors: [door] },
    });
    render(<EditorViewport />);
    fireEvent.click(screen.getByTestId('cell-2-1'));
    expect(useEditorStore.getState().selection).toEqual({ kind: 'door', id: 'door-1' });
  });

  it('renders trap glyph for placed traps', () => {
    const trap: Trap = { id: 'trap-1', x: 2, z: 1, kind: 'fire', damage: 1 };
    useEditorStore.setState({
      level: { ...useEditorStore.getState().level, traps: [trap] },
    });
    render(<EditorViewport />);
    expect(screen.getByTestId('trap-trap-1')).toBeInTheDocument();
  });

  it('renders door glyph for placed doors', () => {
    const door: Door = { id: 'door-1', x: 2, z: 1, keyColor: 'red' };
    useEditorStore.setState({
      level: { ...useEditorStore.getState().level, doors: [door] },
    });
    render(<EditorViewport />);
    expect(screen.getByTestId('door-door-1')).toBeInTheDocument();
  });
});
