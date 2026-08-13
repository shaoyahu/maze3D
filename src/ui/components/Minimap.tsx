import type { CSSProperties, MutableRefObject } from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../engine/Game';
import type { CellType, MazeData, Pickup } from '../../maze/types';
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

// P4b-Panorama: 3-strip container layout. The 120×120 minimap
// Static maze background (walls, exit, pickups) never change after mount.
// React.memo skips its reconciliation on every tick so a50x50 maze doesn't
// spend ~25-50ms/sec re-diffing thousands of static rects.
//
// 2D minimap passes `maze.walls` (or `maze.walls2d[currentLayer]` for
// multi-layer levels) as the `walls2D` prop — a `CellType[][]` with
// `[z][x]` indexing. `exitPos` is `{x, z}` (the 2D `maze.exit` field
// or the multi-layer exit on `currentLayer`).
const StaticMaze = memo(function StaticMaze({
 walls2D,
 exitPos,
 pickups,
}: {
 walls2D: CellType[][];
 exitPos: { x: number; z: number } | null;
 pickups: ReadonlyArray<{ x: number; z: number; type: keyof typeof PICKUP_COLORS }>;
}) {
 return (
 <>
 {walls2D.map((row, z) =>
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
 {exitPos && (
 <rect
 x={exitPos.x}
 y={exitPos.z}
 width="1"
 height="1"
 fill={COLOR_EXIT}
 />
 )}
 {pickups.map((p, i) => (
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

// P3-1: per-layer visited cells overlay. The minimap auto-switches
// to the player's current layer (subscribed from `player.currentLevel`)
// and the engine writes visited cells into `parchment.visitedCells`
// partitioned by layer (a `Map<level, Set<"x,z">>`). This component:
//   - selects the current level's visited set
//     (`parchment.visitedCells.get(level) ?? new Set()`);
//   - renders one rect per visited cell, color-coded
//     `COLOR_VISITED`;
//   - re-renders the parent minimap via the store subscription
//     when either the level or the visited set changes
//     (engine pushes on every `recordVisit` via
//     `setParchment`).
//
// We memoize on `(level, visitedSet)` so a tick that doesn't grow
// the visited set (player standing still on an already-visited
// cell) skips reconciliation — the static maze + view cone +
// player arrow are not re-diffed.
const VisitedCells = memo(function VisitedCells({
 level,
 visited,
}: {
 level: number;
 visited: ReadonlySet<string>;
}) {
 const rects: React.ReactElement[] = [];
 for (const key of visited) {
 const [xStr, zStr] = key.split(',');
 const x = Number(xStr);
 const z = Number(zStr);
 // P3-1: defensive — a hand-authored level that emits a key
 // outside the current maze size should never crash the
 // minimap. Skip silently; the next `recordVisit` will
 // refresh the subscription.
 if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
 rects.push(
 <rect
 key={`${x}-${z}`}
 data-level={level}
 x={x}
 y={z}
 width="1"
 height="1"
 fill={COLOR_VISITED}
 />,
 );
 }
 // `data-testid` on the group so tests can grab the rect list
 // per level and assert which layer the minimap is currently
 // displaying.
 return <g data-testid="minimap-visited" data-level={level}>{rects}</g>;
});

export interface MinimapProps {
 maze: MazeData;
 gameRef: MutableRefObject<Game | null>;
}

// Top-down view of the maze. Player position is polled at ~10 Hz from the
// engine's player state via gameRef - this avoids pushing the player
// position through React state on every frame (which would re-render
// GameCanvas and everything inside it60x per second). The minimap
// re-renders on its own at the polling cadence.
//
// P2-11: when `maze.hideMinimap` is true, return null. Used by the
// 哨兵回廊 teaching level to hide the map during the chase.
//
// P3-1: §6.2 — auto-switches to the player's current layer
// (`useGameStore.player.currentLevel`) and renders that layer's
// visited cells on top of the maze background. The visited overlay
// is `VisitedCells` (memoized on `(level, set)`); the player-level
// subscription is a single `useGameStore` selector so a transition
// that flips the layer triggers a full minimap re-render with the
// new level's data — no manual refresh needed.
//
// P3-1 multi-layer minimap. The 2D path renders the current
// `currentLayer` (P3-1 stack) as a 2D top-down — the per-layer
// walls come from `maze.walls2d[currentLayer]` (multi-layer
// mutex) or `maze.walls` (single-layer back-compat). The
// visited-cells overlay reads `visitedMap.get(currentLayer)` —
// the engine's `recordVisit` uses the same `level` arg for
// both 2D and 3D y-cells. The label "L{n}/{total}" lives in
// the HUD chip (P3-1c), not here. `currentLayer` is the
// 2D-only "which layer is visible" variable — `0..N-1` for
// P3-1 stacks, or the 2D `playerLevel` for single-layer — so
// the visited overlay, the `data-level` attribute, and the
// layer-flip opacity flash all share the same per-layer key.
export function Minimap({ maze, gameRef }: MinimapProps) {
 if (maze.hideMinimap) return null;
 useTickRef(gameRef,100);
 // P3-1: subscribe to the player's current 2D layer (engine pushes
 // via `GameBridge.onLevelChange` → `setCurrentLevel` in
 // GameCanvas). The selector is intentionally narrow — only
 // `player?.currentLevel` — so unrelated store churn (health,
 // inventory, etc.) doesn't re-render the minimap.
 const storedLevel = useGameStore((s) => s.player?.currentLevel ?? 0);
 // P3-1: currentLayer is the 2D vertical layer (P3-1 stack
 // index). Single-layer levels report `currentLevel = 0`; a
 // P3-1 stair-up advances the store-sourced `storedLevel` and
 // the engine fires `onLevelChange` on the same frame, so the
 // minimap re-renders with the new layer's walls in the next
 // React commit.
 const currentLayer = storedLevel;
 // P3-1: subscribe to the parchment so the engine's per-tick
 // `recordVisit` push updates the visited overlay. We read
 // `visitedCells` directly (the `Map<level, Set<"x,z">>` shape)
 // and select the current level's subset in the render body.
 const visitedMap = useGameStore((s) => s.parchment.visitedCells);
 // P3-1: select the current level's visited set. The Map.get
 // short-circuits to undefined for an unknown level (the engine
 // populates the entry on the first `recordVisit` for that
 // layer; the fallback empty Set renders an empty overlay,
 // which is correct for a level the player hasn't walked into
 // yet).
 const visitedForLevel = useMemo(
 () => visitedMap.get(currentLayer) ?? EMPTY_VISITED,
 [visitedMap, currentLayer],
 );
 // P3-1: 0.1s smooth re-render on layer change. The flash state
 // drops opacity to 0.4 on every level flip and the CSS
 // `transition` (see STYLE_CONTAINER extension below) smooths
 // the jump; the timer then restores it. Without the flash
 // the visited overlay would pop (old rects vanish, new rects
 // appear in the same frame), which on a dark / sepia UI feels
 // like a glitch. P4b-Minimap: the `currentLayer` value works
 // for both 2D (`storedLevel`) and 3D (`floor(y / cs)`) — the
 // opacity flash fires on a 3D y-cell flip exactly the same as
 // a 2D P3-1 layer transition, no special-casing.
 const [overlayOpacity, setOverlayOpacity] = useState(1);
 const prevLayerRef = useRef(currentLayer);
 useEffect(() => {
 if (prevLayerRef.current === currentLayer) return;
 prevLayerRef.current = currentLayer;
 setOverlayOpacity(0.4);
 const id = window.setTimeout(() => setOverlayOpacity(1), 50);
 return () => window.clearTimeout(id);
 }, [currentLayer]);
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

 // P3-1: 2D path data. `walls2D` is the per-layer walls
 // (`maze.walls2d[currentLayer]` for multi-layer or
 // `[maze.walls]` for single-layer). `exitPos2D` is the
 // 2D `maze.exit` for the current layer. Memoize so the
 // `<StaticMaze>` reference equality holds across re-renders
 // that don't change the slice (e.g. a yaw-only update) — its
 // `React.memo` then skips reconciliation.
 // P5-editor-multilayer: a 2D multi-layer level (P5-1 teaching
 // fixture) carries `walls2d` only — `maze.walls` is `undefined`
 // per the strict `walls xor walls2d` mutex (decision A5). The
 // `maze.walls ?? maze.walls2d![currentLayer]!` fallback keeps the
 // minimap working for both single-layer (legacy hand-crafted
 // + procedural) and multi-layer paths.
 const walls2D: CellType[][] = useMemo(
   () => (maze.walls ?? maze.walls2d![currentLayer]!)!,
   [maze.walls, maze.walls2d, currentLayer],
 );
 const exitPos2D: { x: number; z: number } | null = useMemo(
   () => maze.exit,
   [maze.exit],
 );
 const pickupsForMinimap = useMemo<ReadonlyArray<Pickup>>(
   () => maze.pickups,
   [maze.pickups],
 );

 return (
 // F-2026-07-01 M-25: in-game minimap is decorative (the 3D view is the
 //  authoritative representation of player position + facing), so it
 //  stays `aria-hidden="true"` and ships with no accessible text. The
 //  *in-editor* minimap (rendered by EditorViewport, styled by
 //  `.editor-viewport-minimap` in theme.css) is the surface that
 //  needs an sr-only <table> summary — that's the one where a blind
 //  level author would otherwise have no semantic picture of the grid
 //  they're editing. That table lives in EditorViewport, not here.
 <div aria-hidden="true" data-testid="minimap" data-level={currentLayer} style={STYLE_CONTAINER}>
 <svg
 viewBox={viewBox}
 width="100%"
 height="100%"
 preserveAspectRatio="xMidYMid meet"
 >
 <StaticMaze walls2D={walls2D} exitPos={exitPos2D} pickups={pickupsForMinimap} />
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
