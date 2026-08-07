// P4b-Minimap: 3D dispatch tests for the Minimap React component.
// These cover the 3D path's render-time decisions:
//
//   - is3D detection (maze.walls3D !== undefined)
//   - rendering walls3D[currentLayer] as the 2D top-down
//   - y-level label "L{n}/{total}" in the top-right corner
//   - exit dispatch: same-layer COLOR_EXIT rect vs off-layer "↑/↓ exit" hint
//   - 3D visited cells: read from visitedMap.get(yCell) (the
//     engine's `recordVisit(parchment, yCell, x, z)` writes
//     under the same key the minimap reads from)
//   - data-level attribute reflects currentLayer (1-indexed
//     for the 3D top-level display, the same convention the
//     2D LevelIndicator HUD chip uses)
//
// The shared test infrastructure (Mock gameRef, game store setup)
// mirrors `tests/component/minimap.test.tsx`'s 2D tests so the
// 3D path is exercised in the same harness.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { Minimap } from '../../src/ui/components/Minimap';
import { useGameStore } from '../../src/store/gameStore';
import type { Game } from '../../src/engine/Game';
import type { CellType, MazeData } from '../../src/maze/types';

// P4b-Minimap: a 5×5×5 3D maze with:
//
//   - layer 0: horizontal corridor (1,0,1) → (3,0,1) plus a
//     single side cell (1,0,2); the rest is walls.
//   - layer 1: a single open cell at (2,1,2) (a "ladder up"
//     from layer 0 at (2,0,2))
//   - layers 2-4: all walls (so the player can climb up but
//     not above layer 1 in this fixture)
//   - start3D = (1, 0, 1), exit3D = (2, 1, 2) (above the
//     player, so the "↑ exit" hint shows on layer 0)
//
// The fixture gives the 3D dispatch tests a deterministic
// layout to assert against — different cells across y-layers,
// a known off-layer exit, and a known 1-cell ladder column.
function make3DTestMaze(): MazeData {
  const size = 5;
  const walls3D: CellType[][][] = [];
  for (let z = 0; z < size; z++) {
    const layer: CellType[][] = [];
    for (let y = 0; y < size; y++) {
      const row: CellType[] = new Array<CellType>(size).fill(1);
      layer.push(row);
    }
    walls3D.push(layer);
  }
  // Layer 0: corridor (1,0,1) → (3,0,1) + (1,0,2)
  for (let x = 1; x <= 3; x++) walls3D[1][0][x] = 0;
  walls3D[2][0][1] = 0;
  // Layer 1: ladder cell at (2,1,2)
  walls3D[2][1][2] = 0;
  // Layers 2-4 stay all walls (default 1 fill).
  return {
    id: 'test-3d-minimap',
    name: 'Test 3D Minimap',
    size: { width: size, depth: size },
    cellSize: 2,
    start: { x: 1, z: 1, level: 0 },
    exit: { x: 1, z: 1, level: 0 },
    start3D: { x: 1, y: 0, z: 1 },
    exit3D: { x: 2, y: 1, z: 2 }, // above the player → "↑ exit" hint
    walls: [],
    walls3D,
    pickups: [],
    rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
    enemies: [],
    traps: [],
    doors: [],
  };
}

// F-P4-MINIMAP-MOCK: 3D mock gameRef. `y` is the player's y
// position in world meters; the minimap projects to
// `Math.floor(y / cellSize)`. The 2D minimap's tests default
// y=0; here we let the test set y to drive the y-layer.
function makeGameState(x: number, z: number, y: number, yaw = 0, fov = 60) {
  return {
    getPlayerPosition: () => ({ x, z }),
    getPlayerY: () => y,
    getPlayerYaw: () => yaw,
    getCameraFov: () => fov,
  } as unknown as Game;
}

function makeGameRef(x: number, z: number, y: number, yaw = 0, fov = 60) {
  return { current: makeGameState(x, z, y, yaw, fov) };
}

beforeEach(() => {
  // Reset the game store so a previous test's player mirror /
  // parchment doesn't bleed into the next. The 3D dispatch
  // reads `s.player?.currentLevel` (P3-1 back-compat, always
  // 0 for 3D) and `s.parchment.visitedCells` (P3-1 shape,
  // reused by P4b-Minimap with yCell as the key).
  useGameStore.setState({
    screen: 'playing',
    player: { currentLevel: 0 },
    parchment: { visitedCells: new Map(), damageRegions: [], isOpen: false },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Minimap P4b-Minimap — 3D dispatch', () => {
  it('data-is-3d="true" + data-level="0" when the player is on layer 0', () => {
    const maze = make3DTestMaze();
    // Player at (1, 0, 1) world (3, 1, 3) → yCell = floor(1 / 2) = 0.
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 1)} />,
    );
    const minimap = container.querySelector('[data-testid="minimap"]');
    expect(minimap).toBeTruthy();
    expect(minimap?.getAttribute('data-is-3d')).toBe('true');
    // currentLayer = 0 (the yCell the player is on, not the
    // 1-indexed display label).
    expect(minimap?.getAttribute('data-level')).toBe('0');
  });

  it('renders the y-level label "L1/5" in the top-right when the player is on layer 0', () => {
    const maze = make3DTestMaze();
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 1)} />,
    );
    const label = container.querySelector('[data-testid="minimap-y-level"]');
    expect(label).toBeTruthy();
    // 1-indexed display (L1 = yCell 0). visualSize=5 → "L1/5".
    expect(label?.textContent).toBe('L1/5');
  });

  it('re-projects walls3D[yCell] when the player crosses a y-layer (y delta > 1/8 cell)', () => {
    // F-P4-MINIMAP-Y-CROSS: the polling tick captures y in the
    // snapshot; when the player climbs from y=1 (yCell 0) to
    // y=3 (yCell 1), the snapshot's y delta exceeds Y_EPSILON,
    // setTick fires, and the minimap re-renders with the new
    // currentLayer. The y-level label updates to "L2/5" and
    // the SVG renders walls3D[1]'s single open cell at (2, 2).
    const maze = make3DTestMaze();
    const ref = makeGameRef(5, 5, 1);
    const { container, rerender } = render(<Minimap maze={maze} gameRef={ref} />);
    // Initial: y=1 → yCell 0 → "L1/5".
    expect(container.querySelector('[data-testid="minimap-y-level"]')?.textContent).toBe('L1/5');
    // Now bump y to 3 (yCell 1) and re-render. The ref returns
    // the new y on each render. The polling tick would also
    // catch this in real use; for the test, we just call
    // rerender with a ref that returns the new y.
    ref.current = makeGameState(5, 5, 3);
    rerender(<Minimap maze={maze} gameRef={ref} />);
    // Now y=3 → yCell 1 → "L2/5".
    expect(container.querySelector('[data-testid="minimap-y-level"]')?.textContent).toBe('L2/5');
    // data-level updates to 1 (0-indexed yCell).
    expect(container.querySelector('[data-testid="minimap"]')?.getAttribute('data-level')).toBe('1');
  });

  it('shows "↑ exit" hint when the exit is on a higher y-layer than the player', () => {
    // Fixture: exit3D = (2, 1, 2) at y=1; player on y=0.
    // The hint should read "↑ exit" and be rendered as an SVG
    // <text> element (not a 2D exit rect).
    const maze = make3DTestMaze();
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 1)} />,
    );
    const hint = container.querySelector('[data-testid="minimap-exit-hint"]');
    expect(hint).toBeTruthy();
    expect(hint?.textContent).toBe('↑ exit');
    // No same-layer exit rect on layer 0 (the exit is on
    // layer 1, so the rect is suppressed).
    const exitRects = container.querySelectorAll('rect[fill="rgba(92, 255, 92, 0.75)"]');
    expect(exitRects.length).toBe(0);
  });

  it('shows "↓ exit" hint when the exit is on a lower y-layer than the player', () => {
    // Reuse the fixture but flip the exit to be below the
    // player's y. Use a new maze so the fixture's other
    // layout doesn't interfere.
    const maze: MazeData = {
      ...make3DTestMaze(),
      exit3D: { x: 2, y: 0, z: 2 }, // (2, 0, 2) is on layer 0, the start is at layer 0 too
    };
    // Player on layer 1 (y=3) — above the exit at y=0.
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(5, 5, 3)} />,
    );
    const hint = container.querySelector('[data-testid="minimap-exit-hint"]');
    expect(hint).toBeTruthy();
    expect(hint?.textContent).toBe('↓ exit');
  });

  it('renders the same-layer exit rect (no hint) when the player is on the exit y-layer', () => {
    const maze: MazeData = {
      ...make3DTestMaze(),
      exit3D: { x: 1, y: 0, z: 2 }, // layer 0, near the start
    };
    // Player on layer 0 (y=1) — same as exit.
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 1)} />,
    );
    const hint = container.querySelector('[data-testid="minimap-exit-hint"]');
    expect(hint).toBeNull();
    // The same-layer exit rect IS rendered (COLOR_EXIT fill).
    const exitRects = container.querySelectorAll('rect[fill="rgba(92, 255, 92, 0.75)"]');
    expect(exitRects.length).toBe(1);
  });

  it('reads visited cells from visitedMap.get(yCell) for the player\'s current y-layer', () => {
    const maze = make3DTestMaze();
    // Pre-populate the parchment with a y=0 visited set
    // containing the start cell (1, 1). The 3D minimap should
    // project this set on top of the maze.
    const set0 = new Set<string>(['1,1']);
    useGameStore.setState({
      parchment: { visitedCells: new Map([[0, set0]]), damageRegions: [], isOpen: false },
    });
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 1)} />,
    );
    // The visited overlay group should have data-level="0"
    // (the yCell the player is on).
    const visitedGroup = container.querySelector('[data-testid="minimap-visited"]');
    expect(visitedGroup?.getAttribute('data-level')).toBe('0');
    // The visited cell is rendered as a rect inside the group.
    const visitedRects = visitedGroup?.querySelectorAll('rect');
    expect(visitedRects?.length).toBe(1);
    // The rect's x/y match the start cell.
    expect(visitedRects?.[0]?.getAttribute('x')).toBe('1');
    expect(visitedRects?.[0]?.getAttribute('y')).toBe('1');
  });

  it('polling tick: 3D y delta > Y_EPSILON triggers a re-render (P4b-Minimap 10Hz poll)', async () => {
    // F-P4-MINIMAP-POLL: the polling tick captures y; when
    // y crosses a cell boundary, |y - y_prev| > Y_EPSILON and
    // the early-out short-circuit fails. setTick fires and
    // the minimap re-renders with the new y-level. We bump
    // the live y value on the mock ref and advance the timer
    // to drive the polling tick.
    vi.useFakeTimers();
    const liveY: { v: number } = { v: 1 }; // y=1 → yCell 0
    const ref = {
      current: {
        getPlayerPosition: () => ({ x: 3, z: 3 }),
        getPlayerY: () => liveY.v,
        getPlayerYaw: () => 0,
        getCameraFov: () => 60,
      } as unknown as Game,
    };
    const { container } = render(<Minimap maze={make3DTestMaze()} gameRef={ref} />);
    // Initial: y=1 → yCell 0 → "L1/5".
    expect(container.querySelector('[data-testid="minimap-y-level"]')?.textContent).toBe('L1/5');
    // Now bump y to 3 (yCell 1). After advancing the timer
    // by 150ms (one polling tick), the snapshot's y delta
    // exceeds Y_EPSILON, setTick fires, and the label
    // re-renders to "L2/5".
    liveY.v = 3;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(container.querySelector('[data-testid="minimap-y-level"]')?.textContent).toBe('L2/5');
  });
});
