import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { useRef } from 'react';
import { Minimap, snapshotsEqual } from '../../src/ui/components/Minimap';
import { useGameStore } from '../../src/store/gameStore';
import type { Game } from '../../src/engine/Game';
import type { MazeData } from '../../src/maze/types';

const maze: MazeData = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 1 }, exit: { x: 2, z: 1 },
  // 5 walls total: row 0 + row 2 are all walls, row 1 (middle) is open.
  walls: [[1, 1, 1], [0, 0, 0], [1, 1, 1]],
  pickups: [{ id: crypto.randomUUID(), x: 1, z: 1, type: 'time', value: 15 }],
  rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
  enemies: [],
  traps: [],
  doors: [],
};

function makeGameState(x: number, z: number, yaw = 0, fov = 60, y = 0) {
  return {
    getPlayerPosition: () => ({ x, z }),
    // P4b-Minimap: 3D minimap polls y from `getPlayerY()` to
    // project the current y-layer. 2D mazes never read y (the
    // test fixtures pass 0 by default), so the existing 2D
    // test cases are unaffected by adding y here.
    getPlayerY: () => y,
    getPlayerYaw: () => yaw,
    getCameraFov: () => fov,
  } as unknown as Game;
}

function makeGameRef(x: number, z: number, yaw = 0, fov = 60, y = 0) {
  // The Minimap reads gameRef.current.getPlayerPosition() / getPlayerYaw()
  // and re-renders when the polling tick bumps. We don't need a real Game
  // instance — the ref-shaped object is enough to exercise the rendering
  // path.
  return { current: makeGameState(x, z, yaw, fov, y) };
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

// P3-1: §6.2 — the minimap auto-switches to the player's current
// layer and renders that layer's visited cells. The store mirror
// is `useGameStore(s => s.player?.currentLevel ?? 0)` (engine
// pushes via `GameBridge.onLevelChange` → `setCurrentLevel` in
// GameCanvas); the visited overlay is selected from
// `parchment.visitedCells.get(currentLevel)`. The two subscriptions
// are tested in isolation:
//
// 1. The `data-level` attribute on the root + the visited <g>
//    reflects the current player level. A test that doesn't touch
//    the store mounts with `player: null` (the menu-screen
//    default) → falls back to layer 0 → renders L0's data.
// 2. After `setState({ player: { currentLevel: 1 } })`, the
//    minimap re-renders with the new level's visited set — the
//    new L1 cells are highlighted, the old L0 cells are gone.
describe('Minimap P3-1 auto-switch', () => {
  beforeEach(() => {
    // P3-1: reset the player mirror + the per-level visited
    // map so each test starts from a clean state. The store
    // default (player: null) means the selector collapses to
    // layer 0 — the pre-P3-1 back-compat default.
    useGameStore.setState({
      player: null,
      parchment: {
        visitedCells: new Map(),
        damageRegions: [],
        isOpen: false,
      },
    });
  });

  it('renders with data-level="0" when the player mirror is null (back-compat default)', () => {
    useGameStore.setState({ player: null });
    const { container } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);
    const root = container.querySelector('[data-testid="minimap"]');
    expect(root).toBeTruthy();
    expect(root?.getAttribute('data-level')).toBe('0');
  });

  it('renders the current level (L0) visited cells from the per-level map', () => {
    // L0 has two visited cells; L1 has a different set. The
    // overlay must show L0's cells only.
    const l0 = new Set<string>(['1,1', '2,1']);
    const l1 = new Set<string>(['0,0', '0,1']);
    useGameStore.setState({
      player: { currentLevel: 0 },
      parchment: {
        visitedCells: new Map([
          [0, l0],
          [1, l1],
        ]),
        damageRegions: [],
        isOpen: false,
      },
    });
    const { container } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);
    const group = container.querySelector('[data-testid="minimap-visited"]');
    expect(group).toBeTruthy();
    expect(group?.getAttribute('data-level')).toBe('0');
    const rects = group?.querySelectorAll('rect') ?? [];
    const coords = Array.from(rects).map(
      (r) => `${r.getAttribute('x')},${r.getAttribute('y')}`,
    );
    expect(coords.sort()).toEqual(['1,1', '2,1']);
  });

  it('auto-re-renders with L1 visited cells when the player crosses a transition', () => {
    // L0 starts with one visited cell. Player walks into a
    // stair, the engine pushes currentLevel = 1, the store
    // mirror follows. The minimap must now show L1's cells
    // (the pre-P3-1 single-layer L0 highlight is gone).
    useGameStore.setState({
      player: { currentLevel: 0 },
      parchment: {
        visitedCells: new Map([
          [0, new Set<string>(['1,1'])],
          [1, new Set<string>(['0,0', '1,0', '2,0'])],
        ]),
        damageRegions: [],
        isOpen: false,
      },
    });
    const { container, rerender } = render(
      <Minimap maze={maze} gameRef={makeGameRef(1, 3)} />,
    );
    // Sanity: the L0 cell is visible.
    let group = container.querySelector('[data-testid="minimap-visited"]');
    let rects = group?.querySelectorAll('rect') ?? [];
    expect(Array.from(rects).map((r) => `${r.getAttribute('x')},${r.getAttribute('y')}`)).toEqual([
      '1,1',
    ]);

    // Engine pushes the new layer. In production this is the
    // bridge's `onLevelChange` callback; in the test we set the
    // store directly to mirror that flow.
    act(() => {
      useGameStore.setState({ player: { currentLevel: 1 } });
    });
    rerender(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);

    // Now L1's three cells are visible; L0's "1,1" is gone.
    group = container.querySelector('[data-testid="minimap-visited"]');
    expect(group?.getAttribute('data-level')).toBe('1');
    rects = group?.querySelectorAll('rect') ?? [];
    const l1Coords = Array.from(rects).map(
      (r) => `${r.getAttribute('x')},${r.getAttribute('y')}`,
    );
    expect(l1Coords.sort()).toEqual(['0,0', '1,0', '2,0']);
  });

  it('renders an empty visited overlay when the level has no map entry yet', () => {
    // Pre-walked case: a player jumps straight to L2 without
    // visiting L0 or L1. The map for L2 is absent → empty
    // overlay → no rects, but the component must not crash.
    useGameStore.setState({ player: { currentLevel: 2 } });
    const { container } = render(<Minimap maze={maze} gameRef={makeGameRef(1, 3)} />);
    const group = container.querySelector('[data-testid="minimap-visited"]');
    expect(group).toBeTruthy();
    expect(group?.getAttribute('data-level')).toBe('2');
    expect(group?.querySelectorAll('rect').length ?? 0).toBe(0);
  });
});

// F-minimap-strictmode-regression (2026-06-14): the live game was
// rendering a frozen player arrow and no view cone because React
// <StrictMode> intentionally runs every effect twice in dev. The
// previous design used a SEPARATE empty-deps effect to flip a
// `cancelledRef` to `true` on unmount, so StrictMode's
// mount-unmount-mount cycle left the flag stuck `true` after the
// re-mount. The polling tick's `if (cancelledRef.current) return;`
// guard then short-circuited every tick and the minimap never
// re-rendered. These cases pin the fix:
//
// - the polling tick at 100ms DOES re-render the arrow + cone when
//   the engine mutates the same ref's position in place
//   (the engine's own behaviour — see Game.ts:363).
// - cancelling-then-restarting the interval via the `screen` change
//   (e.g. pause → resume) also leaves the next interval alive
//   (the cleanup-and-restart path that StrictMode exercises).
//
// Both cases fail under the old design (cancelledRef stuck `true`).
describe('Minimap polling tick under <StrictMode>', () => {
  beforeEach(() => {
    // The polling effect is gated on screen === 'playing'; seed the
    // store before mounting so the first effect run installs the
    // interval (instead of early-returning on a non-playing screen).
    useGameStore.setState({ screen: 'playing' });
  });
  afterEach(() => {
    vi.useRealTimers();
    useGameStore.setState({ screen: 'menu' });
  });

  it('re-renders the arrow when the engine mutates the position in place', async () => {
    vi.useFakeTimers();
    // Mirror the engine: a single position object the engine mutates
    // in place (see Game.ts updatePlayerPosition). The polling tick
    // reads from this same object via the ref every 100ms.
    const livePos: { x: number; z: number } = { x: 1, z: 3 };
    const ref = {
      current: {
        getPlayerPosition: () => livePos,
        getPlayerY: () => 0,
        getPlayerYaw: () => 0,
        getCameraFov: () => 60,
      } as unknown as Game,
    };
    const { container } = render(
      <React.StrictMode>
        <Minimap maze={maze} gameRef={ref} />
      </React.StrictMode>,
    );
    const arrow = () => container.querySelector('[data-testid="player-arrow"]');
    const cone = () => container.querySelector('[data-testid="view-cone"]');
    // Initial: world (1, 3) with cellSize 2 → grid (0.5, 1.5).
    expect(arrow()?.getAttribute('transform')).toBe('translate(0.5 1.5) rotate(0)');
    // Engine mutates the same object in place: world (3, 5) → grid (1.5, 2.5).
    livePos.x = 3;
    livePos.z = 5;
    // Wait long enough for at least one polling tick (interval = 100ms)
    // plus the early-out filter (pos delta of 1 full cell >> 1/8 cell).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(arrow()?.getAttribute('transform')).toBe('translate(1.5 2.5) rotate(0)');
    expect(cone()?.getAttribute('transform')).toBe('translate(1.5 2.5) rotate(0)');
  });

  it('keeps the polling tick alive after a pause → resume screen transition', async () => {
    vi.useFakeTimers();
    const livePos: { x: number; z: number } = { x: 1, z: 3 };
    const ref = {
      current: {
        getPlayerPosition: () => livePos,
        getPlayerY: () => 0,
        getPlayerYaw: () => 0,
        getCameraFov: () => 60,
      } as unknown as Game,
    };
    const { container } = render(
      <React.StrictMode>
        <Minimap maze={maze} gameRef={ref} />
      </React.StrictMode>,
    );
    const arrow = () => container.querySelector('[data-testid="player-arrow"]');
    // Pause: cleanup runs, interval cleared, cancelledRef flipped to true.
    useGameStore.setState({ screen: 'paused' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    // Resume: a fresh effect runs, resets cancelledRef to false, installs
    // a new interval. The arrow must follow subsequent position mutations.
    useGameStore.setState({ screen: 'playing' });
    livePos.x = 3;
    livePos.z = 5;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(arrow()?.getAttribute('transform')).toBe('translate(1.5 2.5) rotate(0)');
  });

  // F-minimap-pos-reference (2026-06-14): the engine mutates the
  // position OBJECT in place every frame (this.player.position.x =
  // next.x in Game.ts:363). If the snapshot stored the engine's pos
  // object directly, prev.pos === next.pos and snapshotsEqual would
  // return true forever — the minimap would only re-render when
  // yaw/fov changed, never on position. This case pins the fix:
  // the snapshot must be a value copy, not a live reference, so
  // each tick compares fresh values to the previous tick's values.
  it('re-renders the arrow on pure position changes (no rotation)', async () => {
    vi.useFakeTimers();
    const livePos: { x: number; z: number } = { x: 1, z: 3 };
    const ref = {
      current: {
        getPlayerPosition: () => livePos,
        getPlayerY: () => 0, // y constant — must not be the trigger
        getPlayerYaw: () => 0, // yaw constant — must not be the trigger
        getCameraFov: () => 60,
      } as unknown as Game,
    };
    const { container } = render(
      <React.StrictMode>
        <Minimap maze={maze} gameRef={ref} />
      </React.StrictMode>,
    );
    const arrow = () => container.querySelector('[data-testid="player-arrow"]');
    // Initial: world (1, 3) → grid (0.5, 1.5).
    expect(arrow()?.getAttribute('transform')).toBe('translate(0.5 1.5) rotate(0)');
    // Player moves to (5, 5) with no rotation change. Under the old
    // (reference-based) snapshot, prev.pos === next.pos, so the
    // early-out would skip setTick and the arrow would NOT update.
    livePos.x = 5;
    livePos.z = 5;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(arrow()?.getAttribute('transform')).toBe('translate(2.5 2.5) rotate(0)');
    // Move again, still no rotation. Each tick must compare the new
    // position values to the snapshot's COPIED values, not to a
    // reference that auto-tracks the engine's mutations.
    livePos.x = 7;
    livePos.z = 9;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(arrow()?.getAttribute('transform')).toBe('translate(3.5 4.5) rotate(0)');
  });
});

// P2-10 (A-M6) pins the epsilon-threshold contract of the polling
// tick's early-out. The hook compares the last snapshot to the next
// one and skips setTick when nothing visibly changed; that comparison
// is a 4-field AND of strict-< per epsilon. These cases are unit-level
// (no DOM, no Three.js) so the contract is exercised without relying
// on the render path — the only place this contract is observable in
// production code is "the React tree doesn't churn at 10Hz when the
// player is idle", which is impossible to assert deterministically
// from a Vitest case.
describe('snapshotsEqual (A-M6 epsilon early-out)', () => {
  // The thresholds are exported only as comments in Minimap.tsx; we
  // mirror them here as plain numbers so a regression that loosens or
  // tightens the constants in the source fails these tests loudly.
  const POS_EPSILON = 1 / 8;
  const YAW_EPSILON_RAD = (0.5 * Math.PI) / 180;
  const FOV_EPSILON_DEG = 0.1;

  // A structurally-compatible shape: PlayerSnapshot isn't exported, so
  // we let TypeScript infer the literal type from snapshotsEqual's
  // parameter signature. P4b-Minimap adds `y` to the snapshot
  // (the 3D minimap polls y from `Game.getPlayerY()` to
  // project the current y-layer); the early-out epsilon for y
  // matches x/z (Y_EPSILON = 1/8 cell), so the 2D tests'
  // "no y delta" assumption holds when y === 0 (a 2D maze
  // never crosses the y threshold).
  const base = () => ({ pos: { x: 1, z: 1 }, y: 0, yaw: 0, fov: 60 });

  it('returns true for identical snapshots', () => {
    expect(snapshotsEqual(base(), base())).toBe(true);
  });

  it('returns true when pos.x is within 1/8 of a cell', () => {
    const a = base();
    const b = { ...base(), pos: { x: a.pos.x + POS_EPSILON / 2, z: a.pos.z } };
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it('returns true when pos.z is within 1/8 of a cell', () => {
    const a = base();
    const b = { ...base(), pos: { x: a.pos.x, z: a.pos.z - POS_EPSILON / 2 } };
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it('returns true when yaw is within 0.5° in radians', () => {
    const a = base();
    const b = { ...base(), yaw: a.yaw + YAW_EPSILON_RAD / 2 };
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it('returns true when fov is within 0.1°', () => {
    const a = base();
    const b = { ...base(), fov: a.fov + FOV_EPSILON_DEG / 2 };
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it('returns false when pos.x exceeds 1/8 of a cell (1 full cell away)', () => {
    const a = base();
    const b = { ...base(), pos: { x: a.pos.x + 1, z: a.pos.z } };
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('returns false when pos.z exceeds 1/8 of a cell (1 full cell away)', () => {
    const a = base();
    const b = { ...base(), pos: { x: a.pos.x, z: a.pos.z - 1 } };
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('returns false when yaw exceeds 0.5° in radians (1° away)', () => {
    const a = base();
    const b = { ...base(), yaw: a.yaw + 1 * (Math.PI / 180) };
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('returns false when fov exceeds 0.1° (1° away)', () => {
    const a = base();
    const b = { ...base(), fov: a.fov + 1 };
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('boundary: pos.x delta of exactly 1/8 cell returns false (strict <, not <=)', () => {
    // The function uses Math.abs(...) < epsilon, not <=. A regression
    // that flipped to <= would silently include 1/8-cell motion in the
    // "no visible change" bucket and would not be caught by the
    // half-epsilon positive case above.
    const a = base();
    const b = { ...base(), pos: { x: a.pos.x + POS_EPSILON, z: a.pos.z } };
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('boundary: yaw delta of exactly 0.5° in radians returns false (strict <)', () => {
    const a = base();
    const b = { ...base(), yaw: a.yaw + YAW_EPSILON_RAD };
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('boundary: fov delta of exactly 0.1° returns false (strict <)', () => {
    const a = base();
    const b = { ...base(), fov: a.fov + FOV_EPSILON_DEG };
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('all four deltas at half-epsilon return true (the "noise" case)', () => {
    // The realistic case: a polling tick where the engine's
    // getPlayerPosition / yaw / fov return values wobble by less than
    // half-epsilon on every field simultaneously. The early-out must
    // accept this as a no-visible-change.
    const a = base();
    const b = {
      pos: { x: a.pos.x + POS_EPSILON / 2, z: a.pos.z - POS_EPSILON / 2 },
      y: a.y,
      yaw: a.yaw + YAW_EPSILON_RAD / 2,
      fov: a.fov + FOV_EPSILON_DEG / 2,
    };
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it('a single exceeding delta short-circuits to false even when the other three are exactly equal', () => {
    // The contract is && of strict-<; if a future refactor accidentally
    // uses ||, a single exceeding delta would still return true, and
    // the polling tick would skip a real re-render. This case pins the
    // AND semantics. P4b-Minimap: 4 fields now (pos.x, pos.z, y, yaw, fov)
    // — but the contract shape stays the same (each below-epsilon delta
    // contributes an independent && clause).
    const a = base();
    const b = { pos: { x: a.pos.x + 1, z: a.pos.z }, y: a.y, yaw: a.yaw, fov: a.fov };
    expect(snapshotsEqual(a, b)).toBe(false);
  });
});
