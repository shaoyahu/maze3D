// P4b-Panorama: 3-strip 堆叠 minimap tests. P4b-Minimap
// tests cover the single-layer dispatch and y-level label;
// this file covers the panorama-specific behavior:
//
//   - 3 strips render (top neighbor + current + bottom neighbor)
//   - out-of-bounds strips (currentLayer=0 / visualSize-1) are hidden
//   - adjacent strips are 50% fill-opacity, current strip is 100%
//   - player arrow + cone + visited + exit hint only on current strip
//   - exit rect only on current strip when exit3D.y === currentLayer
//   - the 3-strip layout uses 3 SVG elements, not 1 (verifying
//     the dispatch is in the panorama path, not the legacy
//     single-SVG path)
//   - y-level label still works (P4b-Minimap contract)
//   - 1px separator visible between strips (visual only, not asserted)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { Minimap } from '../../src/ui/components/Minimap';
import { useGameStore } from '../../src/store/gameStore';
import type { Game } from '../../src/engine/Game';
import type { CellType, MazeData } from '../../src/maze/types';

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
  for (let x = 1; x <= 3; x++) walls3D[1][0][x] = 0;
  walls3D[2][0][1] = 0;
  walls3D[2][0][2] = 0;
  walls3D[2][1][2] = 0;
  walls3D[2][2][2] = 0;
  return {
    id: 'test-3d-panorama',
    name: 'Test 3D Panorama',
    size: { width: size, depth: size },
    cellSize: 2,
    start: { x: 1, z: 1, level: 0 },
    exit: { x: 1, z: 1, level: 0 },
    start3D: { x: 1, y: 0, z: 1 },
    exit3D: { x: 2, y: 2, z: 2 }, // 2 layers above start → "↑ exit" hint
    walls: [],
    walls3D,
    pickups: [],
    rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
    enemies: [],
    traps: [],
    doors: [],
  };
}

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
  useGameStore.setState({
    screen: 'playing',
    player: { currentLevel: 0 },
    parchment: { visitedCells: new Map(), damageRegions: [], isOpen: false },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Minimap P4b-Panorama — 3-strip 堆叠', () => {
  it('renders 3 strips (top + current + bottom) when currentLayer is in the middle of the cube', () => {
    // Player on layer 2 of a 5³ cube. All 3 strips should
    // render (top = layer 3, current = layer 2, bottom = layer 1).
    const maze = make3DTestMaze();
    // Player y = 1*2+1 = 3 (cell center for yCell 1)... actually
    // let's use yCell = 2 → y = 5 (world meters).
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 5)} />,
    );
    const strips = container.querySelectorAll('[data-testid="minimap-strip"]');
    expect(strips.length).toBe(3);
    // The middle strip carries the player arrow (per Q6); the
    // top and bottom strips do not.
    const arrows = container.querySelectorAll('[data-testid="player-arrow"]');
    expect(arrows.length).toBe(1);
  });

  it('hides the bottom strip when currentLayer=0 (out-of-bounds below)', () => {
    // Player at y=0, no layer below. Only top + current render.
    const maze = make3DTestMaze();
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 1)} />,
    );
    const strips = container.querySelectorAll('[data-testid="minimap-strip"]');
    expect(strips.length).toBe(2);
  });

  it('hides the top strip when currentLayer=visualSize-1 (out-of-bounds above)', () => {
    // Player at top of 5³ (yCell=4, y world = 4*2+1 = 9).
    const maze = make3DTestMaze();
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 9)} />,
    );
    const strips = container.querySelectorAll('[data-testid="minimap-strip"]');
    expect(strips.length).toBe(2);
  });

  it('applies 50% fill-opacity to adjacent strips and 100% to the current strip', () => {
    const maze = make3DTestMaze();
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 5)} />,
    );
    const strips = Array.from(container.querySelectorAll('[data-testid="minimap-strip"]'));
    // The current strip (middle) has 100% opacity; top and
    // bottom are 50%. The opacity is applied to the <g>
    // wrapping the StaticMaze, so we check the inner SVG's
    // first <g> element.
    const opacities = strips.map((s) => {
      const g = s.querySelector('svg > g');
      const style = g ? (g as HTMLElement).style.opacity : '';
      return style;
    });
    // 3 strips, middle one is current.
    expect(opacities[0]).toBe('0.5'); // top
    expect(opacities[1]).toBe('1'); // current
    expect(opacities[2]).toBe('0.5'); // bottom
  });

  it('renders the exit hint only on the current strip when exit3D is off-layer', () => {
    // Fixture: exit3D = (2, 2, 2) at yCell 2; player on yCell 1.
    // The "↑ exit" hint should appear once (in the middle strip).
    const maze = make3DTestMaze();
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(5, 5, 3)} />,
    );
    const hints = container.querySelectorAll('[data-testid="minimap-exit-hint"]');
    expect(hints.length).toBe(1);
    expect(hints[0]?.textContent).toBe('↑ exit');
  });

  it('renders the exit rect only on the current strip when exit3D is on the current layer', () => {
    // Override fixture to put exit3D on the player's current layer.
    const maze: MazeData = {
      ...make3DTestMaze(),
      exit3D: { x: 2, y: 1, z: 2 },
    };
    // Player on yCell 1 → y = 1*2+1 = 3.
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(5, 5, 3)} />,
    );
    // The same-layer exit rect is rendered ONCE (in the current
    // strip), with the COLOR_EXIT green fill.
    const exitRects = container.querySelectorAll('rect[fill="rgba(92, 255, 92, 0.75)"]');
    expect(exitRects.length).toBe(1);
    // No off-layer hint when exit is on the current layer.
    const hints = container.querySelectorAll('[data-testid="minimap-exit-hint"]');
    expect(hints.length).toBe(0);
  });

  it('renders the y-level label "L1/5" in the container top-right (P4b-Minimap contract preserved)', () => {
    // The label is a P4b-Minimap contract. P4b-Panorama
    // preserves it (same DOM position, same text format).
    const maze = make3DTestMaze();
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 1)} />,
    );
    const label = container.querySelector('[data-testid="minimap-y-level"]');
    expect(label?.textContent).toBe('L1/5');
  });

  it('reads visited cells from visitedMap.get(currentLayer) and renders them only on the current strip', () => {
    // Pre-populate the parchment with a y=1 visited set
    // containing the start cell. Player on yCell 1 should
    // see the visited overlay; adjacent strips do NOT
    // render visited cells (per Q7).
    const set1 = new Set<string>(['2,2']);
    useGameStore.setState({
      parchment: { visitedCells: new Map([[1, set1]]), damageRegions: [], isOpen: false },
    });
    const maze = make3DTestMaze();
    // Player on yCell 1 → y = 3.
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(5, 5, 3)} />,
    );
    // The visited group is rendered inside ONE strip (the
    // current one). Use querySelectorAll on the inner SVG's
    // visited group to count — exactly 1 instance.
    const visitedGroups = container.querySelectorAll('[data-testid="minimap-visited"]');
    expect(visitedGroups.length).toBe(1);
  });

  it('uses 3 separate <svg> elements (not a single panorama SVG)', () => {
    // The P4b-Panorama design uses 3 separate <svg> elements
    // (one per strip), not a single SVG with 3 transformed
    // groups. This is structurally simpler (each strip is
    // independent) and matches the spec's "1px gray separator
    // between strips" approach. Verify the count.
    const maze = make3DTestMaze();
    const { container } = render(
      <Minimap maze={maze} gameRef={makeGameRef(3, 3, 5)} />,
    );
    const svgs = container.querySelectorAll('svg');
    // 3 strips → 3 SVGs (the y-level label is a <div>, not SVG).
    expect(svgs.length).toBe(3);
  });
});
