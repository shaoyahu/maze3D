import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { EnemySpawn, Pickup, PickupType } from '../../maze/types';

// CSS-side counterpart of src/entities/Pickup.ts PICKUP_COLORS, so the
// editor matches the 3D view's per-type palette without importing three.
const PICKUP_CSS_COLOR: Record<PickupType, string> = {
  time: '#ffd84d',
  health: '#ff5050',
  key: '#5fa8ff',
};
const ENEMY_COLOR = '#ff8a3d';
const WALL_COLOR = '#2a2a32';
const FLOOR_COLOR = '#e0e0ea';
const CELL_SIZE = 24;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;

interface CellLookup {
  pickupByCell: Map<string, Pickup>;
  enemyByCell: Map<string, EnemySpawn>;
}

function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

function buildLookups(level: { pickups: Pickup[]; enemies: EnemySpawn[] }): CellLookup {
  const pickupByCell = new Map<string, Pickup>();
  for (const p of level.pickups) pickupByCell.set(cellKey(p.x, p.z), p);
  const enemyByCell = new Map<string, EnemySpawn>();
  for (const e of level.enemies) enemyByCell.set(cellKey(e.x, e.z), e);
  return { pickupByCell, enemyByCell };
}

function pathPointsAttr(path: Array<{ x: number; z: number }>): string {
  return path
    .map((n) => `${n.x * CELL_SIZE + CELL_SIZE / 2},${n.z * CELL_SIZE + CELL_SIZE / 2}`)
    .join(' ');
}

export function EditorViewport() {
  const level = useEditorStore((s) => s.level);
  const tool = useEditorStore((s) => s.tool);
  const selection = useEditorStore((s) => s.selection);
  const camera = useEditorStore((s) => s.camera);
  const setCamera = useEditorStore((s) => s.setCamera);
  const placeWall = useEditorStore((s) => s.placeWall);
  const placeStart = useEditorStore((s) => s.placeStart);
  const placeExit = useEditorStore((s) => s.placeExit);
  const placePickup = useEditorStore((s) => s.placePickup);
  const placeEnemy = useEditorStore((s) => s.placeEnemy);
  const select = useEditorStore((s) => s.select);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  // P3-B-L30: memoize the cell lookups. pick/enemy lookup happens on
  // every mouse hover and every click in the viewport, so re-walking
  // pickups + enemies on each render wastes O(n+m) work. level is
  // stable while the user is moving the cursor around.
  const { pickupByCell, enemyByCell } = useMemo(() => buildLookups(level), [level]);
  // Right-button drag pan. Stored in a ref so the move handler reads the
  // latest pointer position without re-binding on every state change.
  const panStateRef = useRef<{ x: number; y: number } | null>(null);

  const isCellSelected = (x: number, z: number): boolean => {
    if (selection === null) return false;
    if (selection.kind === 'wall') return selection.x === x && selection.z === z;
    if (selection.kind === 'pickup') {
      const p = pickupByCell.get(cellKey(x, z));
      return p ? p.id === selection.id : false;
    }
    if (selection.kind === 'enemy') {
      const e = enemyByCell.get(cellKey(x, z));
      return e ? e.id === selection.id : false;
    }
    return false;
  };

  const handleCellClick = (x: number, z: number): void => {
    if (tool === 'pan') return;
    if (tool === 'select') {
      const pickup = pickupByCell.get(cellKey(x, z));
      if (pickup) {
        select({ kind: 'pickup', id: pickup.id });
        return;
      }
      const enemy = enemyByCell.get(cellKey(x, z));
      if (enemy) {
        select({ kind: 'enemy', id: enemy.id });
        return;
      }
      if (level.walls[z]?.[x] === 1) {
        select({ kind: 'wall', x, z });
        return;
      }
      clearSelection();
      return;
    }
    if (tool === 'wall') placeWall(x, z);
    else if (tool === 'start') placeStart(x, z);
    else if (tool === 'exit') placeExit(x, z);
    else if (tool === 'pickup') placePickup(x, z);
    else if (tool === 'enemy') placeEnemy(x, z, level.size.width);
  };

  // F-L5: native wheel listener with { passive: false } so preventDefault
  // can stop the body from scrolling. React 17+ registers onWheel as
  // passive by default, so e.preventDefault() in the React handler is
  // a no-op. cameraZoomRef keeps the listener stable across zoom changes.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cameraZoomRef = useRef(camera.zoom);
  cameraZoomRef.current = camera.zoom;
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cameraZoomRef.current + direction * ZOOM_STEP));
      if (next !== cameraZoomRef.current) setCamera({ zoom: next });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [setCamera]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 2) return; // right button only
    panStateRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const start = panStateRef.current;
    if (start === null) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // F-L4: scale pan deltas by 1/zoom so the world point under the
    // mouse stays put. Without this, zoom=2 makes the grid slide at
    // 2x screen-pixel speed — mouse appears to move "faster" than grid.
    setCamera({ x: camera.x + dx / camera.zoom, y: camera.y + dy / camera.zoom });
    panStateRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button === 2) panStateRef.current = null;
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Suppress the browser's right-click menu so the pan gesture is clean.
    e.preventDefault();
  };

  const { width, depth } = level.size;
  const gridWidth = width * CELL_SIZE;
  const gridHeight = depth * CELL_SIZE;
  const transform =
    `translate(calc(-50% + ${camera.x}px), calc(-50% + ${camera.y}px)) scale(${camera.zoom})`;

  return (
    <div
      data-testid="editor-viewport"
      id="editor-viewport"
      ref={viewportRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        background: 'var(--bg)',
        cursor: tool === 'pan' ? (panStateRef.current ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none',
      }}
    >
      <div
        data-testid="editor-grid"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: gridWidth,
          height: gridHeight,
          transform,
          transformOrigin: 'center center',
          display: 'grid',
          gridTemplateColumns: `repeat(${width}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${depth}, ${CELL_SIZE}px)`,
        }}
      >
        {Array.from({ length: depth }, (_, z) =>
          Array.from({ length: width }, (_, x) => {
            const isWall = level.walls[z]?.[x] === 1;
            const isStart = level.start.x === x && level.start.z === z;
            const isExit = level.exit.x === x && level.exit.z === z;
            const selected = isCellSelected(x, z);
            return (
              <div
                key={cellKey(x, z)}
                data-x={x}
                data-z={z}
                data-testid={`cell-${x}-${z}`}
                data-wall={isWall ? 1 : 0}
                data-start={isStart ? 1 : 0}
                data-exit={isExit ? 1 : 0}
                onClick={() => handleCellClick(x, z)}
                style={{
                  position: 'relative',
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  background: isWall ? WALL_COLOR : FLOOR_COLOR,
                  outline: selected ? '2px solid var(--accent)' : 'none',
                  outlineOffset: '-2px',
                  cursor: tool === 'pan' ? 'inherit' : 'pointer',
                  zIndex: 1,
                }}
              >
                {isStart && (
                  <span
                    data-testid={`start-${x}-${z}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      color: '#3ec46d',
                      fontSize: 16,
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}
                  >
                    ▲
                  </span>
                )}
                {isExit && (
                  <span
                    data-testid={`exit-${x}-${z}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      color: 'var(--danger)',
                      fontSize: 16,
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}
                  >
                    ▼
                  </span>
                )}
              </div>
            );
          }),
        )}

        {level.pickups.map((p) => {
          const selected = selection?.kind === 'pickup' && selection.id === p.id;
          return (
            <div
              key={p.id}
              data-testid={`pickup-${p.id}`}
              data-pickup-type={p.type}
              style={{
                position: 'absolute',
                left: p.x * CELL_SIZE,
                top: p.z * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: PICKUP_CSS_COLOR[p.type],
                fontSize: 11,
                fontWeight: 700,
                pointerEvents: 'none',
                outline: selected ? '2px solid var(--accent)' : 'none',
                outlineOffset: '-2px',
                zIndex: 2,
              }}
            >
              {p.type[0]!.toUpperCase()}
            </div>
          );
        })}

        <svg
          data-testid="enemy-paths"
          width={gridWidth}
          height={gridHeight}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {level.enemies.map((e) => (
            <polyline
              key={`path-${e.id}`}
              data-testid={`path-${e.id}`}
              points={pathPointsAttr(e.path)}
              fill="none"
              stroke={ENEMY_COLOR}
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
          ))}
          {level.enemies.flatMap((e) =>
            e.path.map((n, i) => (
              <circle
                key={`node-${e.id}-${i}`}
                data-testid={`path-node-${e.id}-${i}`}
                cx={n.x * CELL_SIZE + CELL_SIZE / 2}
                cy={n.z * CELL_SIZE + CELL_SIZE / 2}
                r={3}
                fill={ENEMY_COLOR}
              />
            )),
          )}
        </svg>

        {level.enemies.map((e) => {
          const selected = selection?.kind === 'enemy' && selection.id === e.id;
          return (
            <div
              key={e.id}
              data-testid={`enemy-${e.id}`}
              style={{
                position: 'absolute',
                left: e.x * CELL_SIZE,
                top: e.z * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                outline: selected ? '2px solid var(--accent)' : 'none',
                outlineOffset: '-2px',
                zIndex: 3,
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: ENEMY_COLOR,
                  border: '2px solid #1a1a1a',
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
