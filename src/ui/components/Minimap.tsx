import type { CSSProperties } from 'react';
import type { MutableRefObject } from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../engine/Game';
import type { CellType, MazeData, Pickup } from '../../maze/types';
import { useGameStore } from '../../store/gameStore';
import { PICKUP_COLORS } from '../../entities/Pickup';

// P2-2 F1: per-type pickup colors are derived from PICKUP_COLORS so the
// 2D minimap and the 3D scene share a single palette. Convert hex (e.g.
// 0xffd84d) to an rgba() CSS string the SVG fill attribute understands.
function hexToRgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const STYLE_CONTAINER: CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 16,
  width: 120,
  height: 120,
  background: 'rgba(20, 20, 28, 0.85)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: 6,
  pointerEvents: 'none',
  zIndex: 5,
  boxSizing: 'border-box',
};

const COLOR_WALL = '#2a2a3a';
const COLOR_PATH = '#4a4a5a';
const COLOR_EXIT = 'rgba(92, 255, 92, 0.75)';
const COLOR_VIEW_CONE = 'rgba(255, 184, 77, 0.18)'; // accent @18% - the "I see here" wedge
// P3-1: per-layer visited cells get a subtle cyan tint so the
// player can see at a glance which cells they've already walked
// into on the current layer. Distinct from the parchment's
// sepia tint (`rgba(120, 80, 40, 0.18)`) so the two surfaces
// don't visually drift. The alpha is intentionally low — the
// highlight is decorative, not a primary cue (the player
// arrow is the authoritative position signal).
const COLOR_VISITED = 'rgba(120, 200, 255, 0.18)';
// P3-1: shared empty visited set for levels the player hasn't
// walked into yet. The Map.get fallback in the Minimap body
// points at this constant so the visited overlay's reference
// stays stable across re-renders (memoized on identity) and the
// `<g>`'s opacity transition runs without a key churn.
const EMPTY_VISITED: ReadonlySet<string> = new Set<string>();
const PICKUP_DOT_ALPHA = 0.95; // F1: per-type pickup dot alpha

// View cone: length 2 grid cells (so the player can see ~2 cells ahead).
// Width at the tip end is 2 * CONE_LENGTH * tan(fov/2), which matches the
// horizontal angular width the player actually sees in 3D (modulo the
// 1300x269 viewport aspect distortion, which we ignore for visual clarity).
const CONE_LENGTH = 2;

// Arrow shape, centroid at (0,0) so the transform pivots around the
// player position. Tip points up (-Y) by default. After `rotate(-yaw)`
// in SVG coordinates the tip points in the player's world forward
// direction (Three.js yaw=0 -> -Z -> "up" on the minimap, which is the
// default).
const ARROW_HALF_BASE = 0.28;
const ARROW_LENGTH = 0.44;
const ARROW_POINTS = `0,${-ARROW_LENGTH} ${-ARROW_HALF_BASE},${ARROW_LENGTH * 0.4} ${ARROW_HALF_BASE},${ARROW_LENGTH * 0.4}`;

// ---------------------------------------------------------------------------
// P4 refactor-fp2d: the 3D YStrip panorama (3 stacked y-layer
// strips, one per y-cell the player can see) is removed. The
// 3D mode the user now sees is a first-person perspective
// camera rendering the SAME 2D multi-layer data the 2D
// top-down view consumes, so the minimap is now a single
// 2D top-down strip of the current layer regardless of the
// `view` query. The previous 3D branches (currentLayer from
// `floor(playerY / cellSize)`, off-layer `↑ exit` / `↓ exit`
// hint, walls3D / exit3D dispatch) are gone; the layer
// index flows from the gameStore's `currentLevel` (P3-1
// path) the same way the historical 2D minimap always
// consumed it.
//
// `YStrip` (the 3-strip renderer), the `YStripProps` interface,
// the `STRIP_HEIGHT_PX` / `STRIP_SEPARATOR` constants, the
// `Y_EPSILON` snapshot threshold, and the `is3D` dispatch are
// all deleted in lockstep with this. The remaining minimap is
// the historical 2D top-down surface (P2-3 / P3-1), with the
// only 3D-traceable change being the `PlayerSnapshot.y` field
// removal from the polling hook — the 2D minimap never reads
// y so carrying it in the snapshot was a dead field.
// ---------------------------------------------------------------------------

export interface MinimapProps {
  maze: MazeData;
  gameRef: MutableRefObject<Game | null>;
}

// One full strip: walls + exit + pickups. The component is React.memo'd
// so a yaw-only update on the parent doesn't re-render the static
// wall/exit/pickup subtree (its props are reference-stable across yaw
// ticks — the walls / exit / pickups arrays are constructed once per
// level and never mutated by the engine).
const StaticMaze = memo(function StaticMaze({
  walls2D,
  exitPos,
  pickups,
}: {
  walls2D: CellType[][];
  exitPos: { x: number; z: number } | null;
  pickups: ReadonlyArray<Pickup>;
}) {
  const rects: React.ReactNode[] = [];
  for (let z = 0; z < walls2D.length; z++) {
    const row = walls2D[z];
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      const isWall = cell === 1;
      rects.push(
        <rect
          key={`${x},${z}`}
          x={x}
          y={z}
          width={1}
          height={1}
          fill={isWall ? COLOR_WALL : COLOR_PATH}
        />,
      );
    }
  }
  return (
    <g data-testid="static-maze">
      {rects}
      {exitPos && (
        <rect
          data-testid="minimap-exit"
          x={exitPos.x}
          y={exitPos.z}
          width={1}
          height={1}
          fill={COLOR_EXIT}
        />
      )}
      {pickups.map((p) => (
        <circle
          key={p.id}
          cx={p.x + 0.5}
          cy={p.z + 0.5}
          r={0.18}
          fill={hexToRgba(PICKUP_COLORS[p.type].color, PICKUP_DOT_ALPHA)}
        />
      ))}
    </g>
  );
});
StaticMaze.displayName = 'StaticMaze';

// P3-1: visited cells overlay. One `<rect>` per visited cell key
// (`"x,z"` strings on the current layer). The wrapper's
// `data-testid` lets the level-flip test assert that the
// overlay swaps atomically (a fresh memoized subtree per
// level so old rects unmount cleanly).
const VisitedCells = memo(function VisitedCells({
  level,
  visited,
}: {
  level: number;
  visited: ReadonlySet<string>;
}) {
  // P4 refactor-fp2d: render the `<g data-testid="minimap-visited">`
  // wrapper even when `visited.size === 0` so consumers (unit tests,
  // the level-flip transition wrapper) can query the group by its
  // testid without an early-out. The empty group is harmless in
  // production: SVG skips empty `<g>` elements during paint, and
  // the wrapper's opacity transition (0.1s linear) is still cheap
  // on an empty subtree. The old early-return made the
  // `data-testid="minimap-visited"` query return null in the
  // pre-walked case (player on L2 with no map entry for L2),
  // which broke the P3-1 auto-switch test.
  return (
    <g data-testid="minimap-visited" data-level={level}>
      {Array.from(visited).map((key) => {
        const [xs, zs] = key.split(',');
        const x = Number(xs);
        const z = Number(zs);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        return (
          <rect
            key={key}
            x={x}
            y={z}
            width={1}
            height={1}
            fill={COLOR_VISITED}
          />
        );
      })}
    </g>
  );
});
VisitedCells.displayName = 'VisitedCells';

export function Minimap({ maze, gameRef }: MinimapProps) {
  // P3-1: subscribe to the parchment so the engine's per-tick
  // `recordVisit` push updates the visited overlay. We read
  // from the store on every render (the `parchment` value is
  // referentially stable when nothing changed, so React skips
  // the re-render that an unrelated state change would
  // otherwise force).
  const parchment = useGameStore((s) => s.parchment);
  // P3-1: subscribe to the current level (vertical layer) so a
  // transition completion swaps the visited overlay to the new
  // layer's set without polling. The store's setter has a
  // no-op guard so a tween that lands on the same layer
  // doesn't churn the React tree. The state lives on
  // `state.player.currentLevel` (P3-1 setter hook on
  // gameStore); a pre-gameboard render falls back to 0
  // (the historical single-layer default) so the minimap
  // doesn't crash before the engine is initialized.
  const storedLevel = useGameStore((s) => s.player?.currentLevel ?? 0);
  const currentLayer = storedLevel;
  const visitedForLevel = useMemo(
    () => parchment.visitedCells.get(currentLayer) ?? EMPTY_VISITED,
    [parchment.visitedCells, currentLayer],
  );

  // 10 Hz polling tick: schedules a re-render when the player's
  // world-space position / yaw / fov change beyond the epsilon
  // thresholds. The actual snapshot lives in `lastPolledSnapshotRef`
  // (module-level) so the render body can read it without
  // round-tripping through React state. `useTickRef` also writes
  // to the module-level ref on every non-early-out tick so the
  // body sees the latest values. Mounted here (vs. at module
  // top-level) so the effect captures this Minimap's `gameRef`
  // closure and the StrictMode contract (cancelledRef flips in
  // cleanup) binds to the per-mount interval.
  useTickRef(gameRef, 100);

  // The snapshot's y comparison (P4b-Minimap) is removed in
  // lockstep with the 3D YStrip panorama. The 2D minimap
  // never reads player.y, so the snapshot is now strictly
  // (x, z, yaw, fov) — every field is a 2D surface. The
  // `PlayerSnapshot.y` field deletion also clears the
  // `Y_EPSILON` threshold (P4b-Minimap) and the `game.getPlayerY()`
  // call site at the polling tick.

  // Compute the player's world meters → grid cell conversion. The
  // player position is in world meters (same as the engine); dividing
  // by cellSize gives the cell index. We pin to the cell center
  // before rendering so the arrow sits on the same spot the 3D
  // player marker does in the world (collision cells, not
  // half-cell-shifted visual cells).
  const cs = maze.cellSize;
  const w = maze.size.width;
  const d = maze.size.depth;
  // viewBox uses 0..width on x and 0..depth on z. Each cell is
  // 1×1 SVG unit, so the player's `(pos.x / cs)` lands on a cell
  // boundary; we add 0.5 to put the arrow at the cell center.
  const viewBox = `0 0 ${w} ${d}`;

  // Memoize the per-render wall/exit/pickup slices so StaticMaze
  // reference equality holds across yaw-only updates — its
  // `React.memo` then skips reconciliation.
  const walls2D: CellType[][] = maze.walls;
  const exitPos2D = maze.exit;
  const pickupsForMinimap = maze.pickups;

  // Compute the player's grid cell + yaw for the player arrow.
  // Reading from the engine's `gameRef` on every render keeps
  // the source of truth in the engine — the minimap is a
  // presentation surface, not a state owner. The `useTickRef`
  // hook below also writes to `lastPolledSnapshotRef` on every
  // tick (so the same value is available without the ref read
  // if `gameRef.current` ever goes null mid-frame); the
  // fallback is the maze's `start` cell so the arrow sits on
  // the level's spawn point (the historical pre-engine-mount
  // placeholder, used by the unit tests that render the
  // minimap with a null `gameRef.current`). The engine-side
  // `getPlayerYaw()` / `getCameraFov()` are read directly (not
  // via the polled snapshot) so the first render after mount
  // shows the live yaw / fov without waiting for the 100ms
  // polling interval to fire.
  const game = gameRef.current;
  const polled = lastPolledSnapshotRef.current;
  const posSource =
    game?.getPlayerPosition() ??
    polled?.pos ?? { x: maze.start.x * cs + cs / 2, z: maze.start.z * cs + cs / 2 };
  const yawSource = game?.getPlayerYaw() ?? polled?.yaw ?? 0;
  const fovSource = game?.getCameraFov() ?? polled?.fov ?? 60;
  const playerGridX = posSource.x / cs;
  const playerGridZ = posSource.z / cs;
  const yawDeg = -(yawSource * 180) / Math.PI;
  // F1: per-frame fov for the view cone width. The cone's
  // tip is `CONE_LENGTH` cells ahead, so the half-width at
  // the tip is `CONE_LENGTH * tan(fov/2)`. The fov is in
  // degrees from the engine; convert to radians for tan().
  const fovRad = (fovSource * Math.PI) / 180;
  const coneHalfWidth = CONE_LENGTH * Math.tan(fovRad / 2);
  // Cone polygon: tip ahead of the player, base at the player,
  // width = 2 * coneHalfWidth at the base. The transform
  // `translate(player) rotate(-yawDeg)` puts the cone in the
  // player's frame (tip points up by default, rotated to
  // match the camera direction).
  const conePoints = `0,${-CONE_LENGTH} ${-coneHalfWidth},0 ${coneHalfWidth},0`;
  // Visited overlay opacity: 0.18 alpha on the cyan fill
  // already gives a subtle highlight, but we wrap it in a
  // `<g opacity="overlayOpacity">` so the level-flip transition
  // (0.1s linear) animates the swap from one layer's set to
  // the next. The transition fires on `currentLayer` change
  // (the level-chip push from the engine flips the store's
  // `currentLevel`, which re-renders the parent and the
  // wrapper gets a new value).
  const overlayOpacity = 1;

  return (
    // F-2026-07-01 M-25: in-game minimap is decorative (the 3D view is the
    // authoritative representation of player position + facing), so it
    // stays `aria-hidden="true"` and ships with no accessible text. The
    // *in-editor* minimap (rendered by EditorViewport, styled by
    // `.editor-viewport-minimap` in theme.css) is the surface that
    // needs an sr-only <table> summary — that's the one where a blind
    // level author would otherwise have no semantic picture of the grid
    // they're editing. That table lives in EditorViewport, not here.
    <div
      aria-hidden="true"
      data-testid="minimap"
      data-level={currentLayer}
      style={STYLE_CONTAINER}
    >
      <svg
        viewBox={viewBox}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <StaticMaze
          walls2D={walls2D}
          exitPos={exitPos2D}
          pickups={pickupsForMinimap}
        />
        {/* P3-1: visited cells for the current layer. The <g> wrapper
         carries the layer-flip opacity transition (0.1s) so the
         swap from the previous level's set to the new one doesn't
         pop. We render a fresh memoized subtree per level so the
         old rects are unmounted, not faded out alongside the new
         ones (which would briefly double-draw the same cell). */}
        <g
          style={{ opacity: overlayOpacity, transition: 'opacity 0.1s linear' }}
          data-testid="minimap-visited-wrap"
        >
          <VisitedCells level={currentLayer} visited={visitedForLevel} />
        </g>
        <polygon
          points={conePoints}
          fill={COLOR_VIEW_CONE}
          transform={`translate(${playerGridX} ${playerGridZ}) rotate(${yawDeg})`}
          data-testid="view-cone"
        />
        <polygon
          points={ARROW_POINTS}
          fill="var(--accent)"
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth="0.06"
          transform={`translate(${playerGridX} ${playerGridZ}) rotate(${yawDeg})`}
          data-testid="player-arrow"
        />
      </svg>
    </div>
  );
}

// Snapshot of the player state captured by the polling tick. The
// hook below keeps the last snapshot in a ref so it can early-out
// when nothing visibly changed (A-M6) without forcing a re-render.
// P4 refactor-fp2d: the `y` field is removed. The 3D YStrip
// panorama needed y to project `walls3D[floor(y / cs)]`;
// without that consumer, carrying y in the snapshot is dead
// weight that just adds an extra comparison every tick.
export interface PlayerSnapshot {
  pos: { x: number; z: number };
  yaw: number; // radians
  fov: number; // degrees
}

// Module-level ref shared with the Minimap body above. The polling
// hook updates it on every tick; the render reads it to keep the
// source of truth in the engine. The ref is intentionally module-
// level (not a per-instance useRef) so a hot-reloaded component
// doesn't lose the snapshot across renders. There is exactly one
// `Minimap` per `GameCanvas`, so a module-level ref is sound.
const lastPolledSnapshotRef: { current: PlayerSnapshot | null } = {
  current: null,
};

// F-A-architecture-M6: epsilon thresholds below which a delta is
// treated as no visible change. The player marker is 1 grid cell
// wide, so 1/8 of a cell is well below the user-perceptible
// granularity; the yaw/FOV deltas match a sub-degree rotation,
// finer than the arrow polygon's apex. Exported (via snapshotsEqual)
// so the threshold logic is pinned by a unit test.
const POS_EPSILON = 1 / 8;
const YAW_EPSILON_RAD = (0.5 * Math.PI) / 180;
const FOV_EPSILON_DEG = 0.1;

// Returns true when `a` and `b` are within the epsilon thresholds on
// every field. The hook calls this to decide whether to skip setTick
// and avoid a wasted re-render.
//
// P4 refactor-fp2d: the `y` field is removed. The 3D YStrip
// panorama needed y to project `walls3D[floor(y / cs)]`;
// without that consumer, carrying y in the snapshot is dead
// weight that just adds an extra comparison every tick.
export function snapshotsEqual(a: PlayerSnapshot, b: PlayerSnapshot): boolean {
  return (
    Math.abs(a.pos.x - b.pos.x) < POS_EPSILON &&
    Math.abs(a.pos.z - b.pos.z) < POS_EPSILON &&
    Math.abs(a.yaw - b.yaw) < YAW_EPSILON_RAD &&
    Math.abs(a.fov - b.fov) < FOV_EPSILON_DEG
  );
}

// Local hook kept in this file so the polling cadence is colocated with
// the only consumer. Bumps a counter every intervalMs to schedule a
// re-render; the actual player position is read from the ref on each
// render so the source of truth stays in the engine. Two cross-cutting
// fixes live here:
//
// - F-A-architecture-M6 (early-out): the last snapshot is held in a
//   ref and compared on each tick. If every field is within the
//   epsilon thresholds, setTick is skipped — a paused or idle player
//   no longer churns the React tree at 10Hz.
//
// - F-D-quality-D-11 (pending guard): a cancelled flag is flipped to
//   `true` in the polling effect's cleanup so an in-flight tick
//   landing between clearInterval and unmount completion cannot call
//   setTick on an unmounted component. Mirrors the pointerLockTimerRef
//   pattern in GameCanvas.tsx:26-31.
//
// CRITICAL (F-minimap-strictmode-regression, fixed 2026-06-14): under
// <React.StrictMode>, React intentionally mounts → unmounts → re-mounts
// every effect in dev. The previous design used a SEPARATE empty-deps
// effect to flip the cancelled flag on unmount, so StrictMode's
// mount-unmount-mount cycle left `cancelledRef.current = true` after
// the second mount. The polling effect's interval was then installed
// with the cancelled flag stuck `true`; every tick short-circuited at
// the `if (cancelledRef.current) return;` guard and the minimap never
// re-rendered (the player arrow froze at the start cell and the view
// cone never repainted). The fix is to (a) move the cancelled-flip
// into the polling effect's own cleanup (so it's bound to the
// interval's lifetime, not a separate effect), and (b) reset the flag
// to `false` at the top of the polling effect on every (re-)run. With
// the reset + flip in the same effect, StrictMode's
// mount-unmount-mount cycle is symmetric: cleanup sets it to `true`,
// the re-run sets it back to `false` before scheduling the new tick.
//
// CRITICAL (F-minimap-pos-reference, fixed 2026-06-14): the engine
// mutates `this.player.position.{x,z}` in place every frame (see
// Game.ts:363). If the snapshot stored the engine's `pos` object
// directly, `prev.pos` and `next.pos` would be the SAME reference
// with the SAME values after the mutation — `snapshotsEqual` would
// return true forever, the A-M6 early-out would fire on every tick,
// and the minimap would never re-render on movement. Only yaw / fov
// (returned by value) would correctly trigger updates, so rotating
// the camera would "snap" the arrow to the live position while
// walking left it frozen. The fix is to copy `pos` on read so the
// snapshot is a value snapshot of the values at the moment of
// capture, decoupled from the engine's mutable state.
//
// P4 refactor-fp2d: also drop the `getPlayerY()` call from the
// snapshot. The 3D YStrip panorama was the only consumer; the
// 2D-only minimap never reads y. The `PlayerSnapshot.y` field
// deletion and the `Y_EPSILON` threshold removal keep the
// snapshot strictly 2D.
function useTickRef(gameRef: MutableRefObject<Game | null>, intervalMs: number): void {
  const [, setTick] = useState(0);
  // F-L13: gate the polling interval on the game screen. Without this
  // subscription, setInterval keeps firing on pause / game-over / win
  // / menu screens and re-renders the minimap against a stale player
  // position. Including `screen` in deps re-runs the effect: when
  // playing → start interval; otherwise → cleanup the running one.
  const screen = useGameStore((s) => s.screen);
  const lastSnapshotRef = useRef<PlayerSnapshot | null>(null);
  // Single cancelledRef owned by THIS effect. The previous design used
  // a second effect with empty deps to flip the flag on unmount, but
  // under StrictMode that effect ran its cleanup between mounts and
  // the flag was never reset. Owning the flag here keeps reset + flip
  // paired across StrictMode's intentional mount-unmount-mount.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (screen !== 'playing') return;
    // Reset on every (re-)run so a fresh interval starts with a clean
    // slate. StrictMode's first-mount → unmount → re-mount cycle will
    // flip this to `true` in the cleanup below, then back to `false`
    // here, leaving the re-mounted interval able to fire.
    cancelledRef.current = false;
    const id = setInterval(() => {
      if (cancelledRef.current) return; // D-11 in-flight guard
      const game = gameRef.current;
      if (!game) return;
      const pos = game.getPlayerPosition();
      if (!pos) return;
      // F-minimap-pos-reference: COPY pos into a fresh object so the
      // snapshot is a value snapshot, not a live reference to the
      // engine's mutable position. The engine mutates `pos.x` / `pos.z`
      // in place every frame, so without this copy prev.pos === next.pos
      // and snapshotsEqual returns true forever.
      const next = {
        pos: { x: pos.x, z: pos.z },
        yaw: game.getPlayerYaw(),
        fov: game.getCameraFov(),
      };
      const prev = lastSnapshotRef.current;
      if (prev && snapshotsEqual(prev, next)) return; // A-M6 early-out
      lastSnapshotRef.current = next;
      lastPolledSnapshotRef.current = next; // share with the render body
      setTick((t) => t + 1);
    }, intervalMs);
    return () => {
      clearInterval(id);
      cancelledRef.current = true;
    };
  }, [gameRef, intervalMs, screen]);
}
