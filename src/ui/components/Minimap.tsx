import type { CSSProperties } from 'react';
import type { MutableRefObject } from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../engine/Game';
import type { MazeData } from '../../maze/types';
import { useGameStore } from '../../store/gameStore';
import { PICKUP_COLORS } from '../../entities/Pickup';

// P2-2 F1: per-type pickup colors are derived from PICKUP_COLORS so the
//2D minimap and the3D scene share a single palette. Convert hex (e.g.
//0xffd84d) to an rgba() CSS string the SVG fill attribute understands.
function hexToRgba(hex: number, alpha: number): string {
 const r = (hex >>16) &0xff;
 const g = (hex >>8) &0xff;
 const b = hex &0xff;
 return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const STYLE_CONTAINER: CSSProperties = {
 position: 'absolute',
 top:16,
 right:16,
 width:120,
 height:120,
 background: 'rgba(20, 20, 28, 0.85)',
 border: '1px solid var(--border)',
 borderRadius:6,
 padding:6,
 pointerEvents: 'none',
 zIndex:5,
 boxSizing: 'border-box',
};

const COLOR_WALL = '#2a2a3a';
const COLOR_PATH = '#4a4a5a';
const COLOR_EXIT = 'rgba(92, 255, 92, 0.75)';
const COLOR_VIEW_CONE = 'rgba(255, 184, 77, 0.18)'; // accent @18% - the "I see here" wedge
const PICKUP_DOT_ALPHA =0.95; // F1: per-type pickup dot alpha

// View cone: length2 grid cells (so the player can see ~2 cells ahead).
// Width at the tip end is2 * CONE_LENGTH * tan(fov/2), which matches the
// horizontal angular width the player actually sees in3D (modulo the
//1300x269 viewport aspect distortion, which we ignore for visual clarity).
const CONE_LENGTH =2;

// Arrow shape, centroid at (0,0) so the transform pivots around the
// player position. Tip points up (-Y) by default. After `rotate(-yaw)`
// in SVG coordinates the tip points in the player's world forward
// direction (Three.js yaw=0 -> -Z -> "up" on the minimap, which is the
// default).
const ARROW_HALF_BASE =0.28;
const ARROW_LENGTH =0.44;
const ARROW_POINTS = `0,${-ARROW_LENGTH} ${-ARROW_HALF_BASE},${ARROW_LENGTH *0.4} ${ARROW_HALF_BASE},${ARROW_LENGTH *0.4}`;

export interface MinimapProps {
 maze: MazeData;
 gameRef: MutableRefObject<Game | null>;
}

// Static maze background (walls, exit, pickups) never change after mount.
// React.memo skips its reconciliation on every tick so a50x50 maze doesn't
// spend ~25-50ms/sec re-diffing thousands of static rects.
const StaticMaze = memo(function StaticMaze({ maze }: { maze: MazeData }) {
 return (
 <>
 {maze.walls.map((row, z) =>
 row.map((cell, x) => (
 <rect
 key={`${x}-${z}`}
 x={x}
 y={z}
 width="1"
 height="1"
 fill={cell ===1 ? COLOR_WALL : COLOR_PATH}
 />
 )),
 )}
 <rect
 x={maze.exit.x}
 y={maze.exit.z}
 width="1"
 height="1"
 fill={COLOR_EXIT}
 />
 {maze.pickups.map((p, i) => (
 <circle
 key={i}
 cx={p.x +0.5}
 cy={p.z +0.5}
 r="0.22"
 fill={hexToRgba(PICKUP_COLORS[p.type].color, PICKUP_DOT_ALPHA)}
 />
 ))}
 </>
 );
});

// Top-down view of the maze. Player position is polled at ~10 Hz from the
// engine's player state via gameRef - this avoids pushing the player
// position through React state on every frame (which would re-render
// GameCanvas and everything inside it60x per second). The minimap
// re-renders on its own at the polling cadence.
export function Minimap({ maze, gameRef }: MinimapProps) {
 useTickRef(gameRef,100);
 const p = gameRef.current?.getPlayerPosition() ?? {
 x: maze.start.x * maze.cellSize + maze.cellSize /2,
 z: maze.start.z * maze.cellSize + maze.cellSize /2,
 };
 // Three.js yaw rotates around the world Y axis with positive = looking
 // left. SVG rotates clockwise positive. We negate so the arrow tip
 // points where the player is looking in world space.
 const yawDeg = -(gameRef.current?.getPlayerYaw() ??0) * (180 / Math.PI);
 // View cone: a translucent triangle from the player extending forward.
 // Width scales with the camera's vertical FOV so the user can see at a
 // glance "how much of the maze I'm currently seeing" - the same wedge
 // they get in the3D view.
 const fovDeg = gameRef.current?.getCameraFov() ??60;
 const halfWidth = CONE_LENGTH * Math.tan((fovDeg * Math.PI /180) /2);
 const conePoints = `0,0 ${-halfWidth},${-CONE_LENGTH} ${halfWidth},${-CONE_LENGTH}`;

 const w = maze.size.width;
 const d = maze.size.depth;
 const cs = maze.cellSize;
 const playerGridX = p.x / cs;
 const playerGridZ = p.z / cs;
 // P3-B-L11: memoize the viewBox string. w/d are stable for the
 // lifetime of a maze, so building a fresh template-literal string
 // every render is pure waste (and a fresh string would also force
 // SVG attribute re-set on every tick).
 const viewBox = useMemo(() => `0 0 ${w} ${d}`, [w, d]);

 return (
 <div aria-hidden="true" data-testid="minimap" style={STYLE_CONTAINER}>
 <svg
 viewBox={viewBox}
 width="100%"
 height="100%"
 preserveAspectRatio="xMidYMid meet"
 >
 <StaticMaze maze={maze} />
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
interface PlayerSnapshot {
 pos: { x: number; z: number };
 yaw: number; // radians
 fov: number; // degrees
}

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
 const next: PlayerSnapshot = {
 pos: { x: pos.x, z: pos.z },
 yaw: game.getPlayerYaw(),
 fov: game.getCameraFov(),
 };
 const prev = lastSnapshotRef.current;
 if (prev && snapshotsEqual(prev, next)) return; // A-M6 early-out
 lastSnapshotRef.current = next;
 setTick((t) => t + 1);
 }, intervalMs);
 return () => {
 clearInterval(id);
 cancelledRef.current = true;
 };
 }, [gameRef, intervalMs, screen]);
}
