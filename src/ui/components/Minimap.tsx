import type { CSSProperties } from 'react';
import type { MutableRefObject } from 'react';
import { memo, useEffect, useState } from 'react';
import type { Game } from '../../engine/Game';
import type { MazeData } from '../../maze/types';
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

 return (
 <div aria-hidden="true" data-testid="minimap" style={STYLE_CONTAINER}>
 <svg
 viewBox={`0 0 ${w} ${d}`}
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

// Local hook kept in this file so the polling cadence is colocated with
// the only consumer. Bumps a counter every intervalMs to schedule a
// re-render; the actual player position is read from the ref on each
// render so the source of truth stays in the engine.
function useTickRef(gameRef: MutableRefObject<Game | null>, intervalMs: number): void {
 const [, setTick] = useState(0);
 useEffect(() => {
 const id = setInterval(() => {
 if (gameRef.current?.getPlayerPosition()) setTick((t) => t +1);
 }, intervalMs);
 return () => clearInterval(id);
 }, [gameRef, intervalMs]);
}
