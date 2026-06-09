import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { Minimap } from '../../src/ui/components/Minimap';
import type { Game } from '../../src/engine/Game';
import type { MazeData } from '../../src/maze/types';

const maze: MazeData = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 1 }, exit: { x: 2, z: 1 },
  // 5 walls total: row 0 + row 2 are all walls, row 1 (middle) is open.
  walls: [[1, 1, 1], [0, 0, 0], [1, 1, 1]],
  pickups: [{ x: 1, z: 1, type: 'time', value: 15 }],
  rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
  enemies: [],
};

function makeGameState(x: number, z: number, yaw = 0, fov = 60) {
  return {
    getPlayerPosition: () => ({ x, z }),
    getPlayerYaw: () => yaw,
    getCameraFov: () => fov,
  } as unknown as Game;
}

function makeGameRef(x: number, z: number, yaw = 0, fov = 60) {
  // The Minimap reads gameRef.current.getPlayerPosition() / getPlayerYaw()
  // and re-renders when the polling tick bumps. We don't need a real Game
  // instance — the ref-shaped object is enough to exercise the rendering
  // path.
  return { current: makeGameState(x, z, yaw, fov) };
}

function expectedArrowTransform(gridX: number, gridZ: number, yaw: number): string {
  // Mirror the formula in Minimap.tsx so the test breaks if the mapping
  // ever drifts.
  const yawDeg = -yaw * (180 / Math.PI);
  return `translate(${gridX} ${gridZ}) rotate(${yawDeg})`;
}

describe('Minimap', () => {
  it('renders an SVG with the maze viewBox scaled to the grid', () => {
    const { container } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 3 3');
  });

  it('renders one rect per maze cell with wall vs path fill', () => {
    const { container } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);
    const wallRects = container.querySelectorAll('rect[fill="#2a2a3a"]');
    const pathRects = container.querySelectorAll('rect[fill="#4a4a5a"]');
    // 6 walls (3 + 3) and 3 path cells (the middle row).
    expect(wallRects.length).toBe(6);
    expect(pathRects.length).toBe(3);
  });

  it('marks the exit cell with the green fill', () => {
    const { container } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);
    const exit = container.querySelector('rect[fill="rgba(92, 255, 92, 0.75)"]');
    expect(exit).toBeTruthy();
    expect(exit?.getAttribute('x')).toBe('2');
    expect(exit?.getAttribute('y')).toBe('1');
  });

  it('renders each pickup as an orange circle centered on its cell', () => {
    const { container } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);
    const pickups = container.querySelectorAll('circle[fill="rgba(255, 216, 77, 0.95)"]');
    expect(pickups.length).toBe(1);
    expect(pickups[0]?.getAttribute('cx')).toBe('1.5');
    expect(pickups[0]?.getAttribute('cy')).toBe('1.5');
  });

  it('renders the player as a polygon arrow (not a circle) at the projected grid position', () => {
    // World (1, 3) with cellSize 2 → grid (0.5, 1.5).
    const { container } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);
    const arrow = container.querySelector('[data-testid="player-arrow"]');
    expect(arrow).toBeTruthy();
    expect(arrow?.tagName.toLowerCase()).toBe('polygon');
    // At yaw=0 the arrow points up (-Z = "up" on the minimap), so the
    // rotation component is 0.
    expect(arrow?.getAttribute('transform')).toBe(expectedArrowTransform(0.5, 1.5, 0));
  });

  it('rotates the arrow to match the player yaw', () => {
    // The minimap mirrors: forward = (-sin yaw, -cos yaw) in (x, z); "up"
    // on the minimap is -Z, so the arrow needs to rotate clockwise
    // (positive SVG degrees) when yaw decreases (player looking right) and
    // counterclockwise (negative SVG degrees) when yaw increases (left).
    const cases: Array<{ yaw: number; expectedDeg: number }> = [
      { yaw: 0, expectedDeg: 0 },                    // looking -Z → up
      { yaw: -Math.PI / 2, expectedDeg: 90 },         // looking +X → right
      { yaw: Math.PI / 2, expectedDeg: -90 },         // looking -X → left
      { yaw: Math.PI, expectedDeg: -180 },            // looking +Z → down (formula yields -180; visually identical to +180)
    ];
    // Normalize an angle to (-180, 180] since +180 and -180 are the same rotation.
    const normalize = (deg: number) => {
      let n = deg % 360;
      if (n > 180) n -= 360;
      if (n <= -180) n += 360;
      return n;
    };
    for (const { yaw, expectedDeg } of cases) {
      const { container } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3, yaw)} />);
      const arrow = container.querySelector('[data-testid="player-arrow"]');
      const transform = arrow?.getAttribute('transform') ?? '';
      const m = transform.match(/rotate\(([-\d.]+)\)/);
      expect(m, `transform was ${transform}`).not.toBeNull();
      const got = normalize(Number(m![1]));
      expect(got).toBeCloseTo(normalize(expectedDeg), 6);
    }
  });

  it('positions itself top-right with pointer-events disabled so clicks pass through to the canvas', () => {
    const { getByTestId } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);
    const el = getByTestId('minimap');
    expect(el.style.position).toBe('absolute');
    expect(el.style.top).toBe('16px');
    expect(el.style.right).toBe('16px');
    expect(el.style.pointerEvents).toBe('none');
  });

  it('falls back to the start cell when the game ref is null', () => {
    // Start (0, 1) with cellSize 2 → world (1, 3) → grid (0.5, 1.5).
    const nullRef = { current: null };
    const { container } = render(<Minimap maze={maze} gameRef={nullRef} />);
    const arrow = container.querySelector('[data-testid="player-arrow"]');
    expect(arrow?.getAttribute('transform')).toBe(expectedArrowTransform(0.5, 1.5, 0));
  });

  it('updates the arrow when the polled ref changes between renders', () => {
    // Mount with world (1, 3). Then mutate the ref and force a re-render.
    const ref = makeGameRef(1, 3);
    const Wrapper = () => {
      const r = useRef<Game | null>(ref.current);
      r.current = ref.current;
      return <Minimap maze={maze} gameRef={r} />;
    };
    const { container, rerender } = render(<Wrapper />);
    const getArrow = () => container.querySelector('[data-testid="player-arrow"]');
    expect(getArrow()?.getAttribute('transform')).toBe(expectedArrowTransform(0.5, 1.5, 0));
    // Player moves to (3, 3) → grid (1.5, 1.5) and turns to face right.
    ref.current = makeGameState(3, 3, -Math.PI / 2);
    rerender(<Wrapper />);
    expect(getArrow()?.getAttribute('transform')).toBe(expectedArrowTransform(1.5, 1.5, -Math.PI / 2));
  });

  it('does not throw when game ref is null on the first render', () => {
    const nullRef = { current: null };
    // Suppress the React 18 useEffect warning, this is the expected path.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Minimap maze={maze} gameRef={nullRef} />)).not.toThrow();
    consoleSpy.mockRestore();
  });
});
