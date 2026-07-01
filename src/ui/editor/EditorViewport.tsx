import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { EditorTool, EnemySpawn, MazeData, Pickup, PickupType } from '../../maze/types';
import type { EditorSelection } from '../../store/editorStore';
import { EditorHelpDrawer } from './EditorHelpDrawer';
import { useT } from '../../i18n';

// CSS-side counterpart of src/entities/Pickup.ts PICKUP_COLORS, so the
// editor matches the 3D view's per-type palette without importing three.
const PICKUP_CSS_COLOR: Record<PickupType, string> = {
  time: '#ffd84d',
  health: '#ff5050',
  key: '#5fa8ff',
};
const ENEMY_COLOR = '#ff8a3d';
const WALL_COLOR = '#1d1f27';
const FLOOR_COLOR = '#e0e0ea';
const CELL_SIZE = 24;
// F-2026-06-18: widened the editor zoom range from [0.5, 3] to
// [0.25, 5]. 50% was too coarse for wide overview shots (15×15 grids
// couldn't be inspected at a glance) and 300% capped too early for
// fine-grained path-node placement on dense maps. Wheel-step stays
// at 0.1 so the rate of change between clicks feels unchanged.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5.0;
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

function minimapCellStyle(x: number, z: number, width: number, depth: number): React.CSSProperties {
  return {
    left: `calc(${(x / width) * 100}%)`,
    top: `calc(${(z / depth) * 100}%)`,
    width: `calc(${100 / width}% - 1px)`,
    height: `calc(${100 / depth}% - 1px)`,
  };
}

export interface EditorViewportProps {
  /** P2-17: whether any overlay (tutorial manual) is open, so the
      viewport's ESC handler should not also fire. Mirrors the
      `helpOpen` gate pattern (F-2026-06-16-L-2). */
  anyOverlayOpen?: boolean;
}

export function EditorViewport({ anyOverlayOpen = false }: EditorViewportProps): React.ReactElement {
  const t = useT();
  const level = useEditorStore((s) => s.level);
  const tool = useEditorStore((s) => s.tool);
  const selection = useEditorStore((s) => s.selection);
  const camera = useEditorStore((s) => s.camera);
  const setCamera = useEditorStore((s) => s.setCamera);
  const placeWall = useEditorStore((s) => s.placeWall);
  // F-P2-9: dedicated erase / carve action. Pairs with `placeWall`
  // (set-to-1) so the toolbar has one tool per direction.
  const placeErase = useEditorStore((s) => s.placeErase);
  const placeStart = useEditorStore((s) => s.placeStart);
  const placeExit = useEditorStore((s) => s.placeExit);
  const placePickup = useEditorStore((s) => s.placePickup);
  const placeEnemy = useEditorStore((s) => s.placeEnemy);
  const appendEnemyPathNode = useEditorStore((s) => s.appendEnemyPathNode);
  const select = useEditorStore((s) => s.select);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const setTool = useEditorStore((s) => s.setTool);

  // F-P2-9: local UI state for the help-drawer toggle. Kept in the
  // viewport (rather than the editor store) because the drawer's
  // open/closed bit is purely cosmetic — it must not affect dirty,
  // history, or save behaviour. Declared before the ESC useEffect so
  // the L-2 gate (`if (helpOpen) return;`) is in scope — F-2026-06-16-L-2
  // closed the "ESC while the help drawer is open also resets the
  // viewport state" double-action bug.
  const [helpOpen, setHelpOpen] = useState(false);

  // F-2026-06-15-M-4.5: global Escape handler. Without this, the user
  // has no keyboard path to leave a non-select tool or to clear the
  // current selection. Pressing Escape clears any selection AND resets
  // the tool to 'select' so the next click does the expected thing.
  // Bound on `document` (not the viewport) so the binding survives the
  // viewport losing focus — e.g. user finished an input edit, lost
  // focus to the body, then hits Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Skip when focus is in an editable field — Escape there typically
      // means "abandon the current input value", not "exit tool mode".
      // F-2026-06-15-M-44: expanded the skip selector to also match
      // any element with a `contenteditable` attribute (covers inline
      // rich-text editors that don't bubble up via isContentEditable),
      // ARIA textbox roles (some custom widgets declare role="textbox"
      // instead of using <input>), and the opt-out
      // `data-no-escape-reset` hook for panels that want to handle
      // Escape themselves.
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          t.isContentEditable ||
          t.hasAttribute('contenteditable') ||
          t.getAttribute('role') === 'textbox' ||
          t.hasAttribute('data-no-escape-reset')
        ) {
          return;
        }
      }
      // F-2026-06-16-L-2: when the help drawer is open, ESC is owned by
      // the drawer (closes it). Letting the viewport's listener also
      // fire would clear the selection + reset the tool — a confusing
      // "two actions for one keystroke" UX. e.stopPropagation() inside
      // EditorHelpDrawer's own listener can't block a sibling listener
      // on the same target, so the gating has to live here.
      // P2-17: same gate for the tutorial manual (anyOverlayOpen).
      if (helpOpen || anyOverlayOpen) return;
      clearSelection();
      setTool('select');
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [clearSelection, setTool, helpOpen, anyOverlayOpen]);

  // hoverCell lives in a child <HoverReadout> rather than here so each
  // mousemove only re-renders the small readout, not the entire grid.
  // The grid body uses an imperative ref + DOM dataset read on
  // mousemove — see `hoverCellRef` and the `handleMouseMove` below.
  const hoverCellRef = useRef<{ x: number; z: number } | null>(null);
  const [hoverCellTick, setHoverCellTick] = useState(0);
  // Tracks whether the user has actually panned in the current pan-tool
  // session — used to auto-hide the "DRAG TO PAN" hint after the first
  // pan gesture so it doesn't linger.
  const [hasPanned, setHasPanned] = useState(false);
  // Reset the "first-pan" flag whenever the user switches away from pan.
  useEffect(() => {
    if (tool !== 'pan') setHasPanned(false);
  }, [tool]);

  // (helpOpen / setHelpOpen are declared above the ESC useEffect so the
  // L-2 gate can read them — see the F-P2-9 comment on the first
  // declaration.)

  const { pickupByCell, enemyByCell } = useMemo(() => buildLookups(level), [level]);
  const panStateRef = useRef<{ x: number; y: number } | null>(null);

  // F-2026-06-15-M-45: was an inline arrow rebuilt on every render, which
  // also meant downstream memoization of the per-cell render tree
  // (see M-51 GridCell) would never stick — every parent render handed
  // a fresh function reference to children. Wrapping in useCallback
  // with [selection, pickupByCell, enemyByCell] deps keeps the identity
  // stable as long as the selection / lookup maps don't change.
  const isCellSelected = useCallback(
    (x: number, z: number): boolean => {
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
    },
    [selection, pickupByCell, enemyByCell],
  );

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
    else if (tool === 'erase') placeErase(x, z);
    else if (tool === 'start') placeStart(x, z);
    else if (tool === 'exit') placeExit(x, z);
    else if (tool === 'pickup') placePickup(x, z);
    else if (tool === 'enemy') {
      // If an enemy is already selected, treat the click as "append a
      // patrol waypoint to that enemy" instead of placing a new one.
      // Empty cells still place; existing-enemy clicks extend the path.
      if (selection?.kind === 'enemy') {
        appendEnemyPathNode(selection.id, x, z);
        return;
      }
      placeEnemy(x, z, level.size.width);
    } else {
      // F-2026-06-16-M-4: exhaustiveness check. If a new EditorTool
      // variant is added without a branch here, the `never` assignment
      // fails to compile (tool narrows to `never` after every known
      // case), catching the missing branch at build time instead of
      // letting the click silently no-op for the new tool.
      const _exhaustive: never = tool;
      throw new Error(`handleCellClick: unhandled tool ${String(_exhaustive)}`);
    }
  };

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cameraZoomRef = useRef(camera.zoom);
  cameraZoomRef.current = camera.zoom;
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent): void => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const next = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, cameraZoomRef.current + direction * ZOOM_STEP),
      );
      if (next !== cameraZoomRef.current) {
        // F-2026-06-15-M-46: write the ref synchronously so a follow-up
        // wheel event in the same tick (rapid trackpad / mouse-wheel
        // bursts) sees the latest zoom instead of the stale value. The
        // store update is async, so without this the next event would
        // still be computed against the old `cameraZoomRef.current`,
        // losing increments that crossed the ZOOM_STEP boundary.
        cameraZoomRef.current = next;
        setCamera({ zoom: next });
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [setCamera]);

  // F-2026-06-15-M-47/M-49: keep a ref-synced copy of `camera` so the
  // pan handler (registered on every render) reads the latest value
  // instead of the render-time closure capture. Without this, a
  // mid-drag setCamera would only land in the next render — and the
  // mousemove handler that fired in between would still read the
  // stale `camera` from the closure, producing a stuttery pan with
  // small jumps every time React committed the new camera state.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Pan works with either button when the pan tool is selected (left
    // drag is the natural expectation; right drag still works in any
    // tool for trackpad users). Outside pan mode only right-drag pans.
    if (tool === 'pan') {
      if (e.button !== 0 && e.button !== 2) return;
    } else if (e.button !== 2) {
      return;
    }
    panStateRef.current = { x: e.clientX, y: e.clientY };
    setCamera({ ...cameraRef.current });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const start = panStateRef.current;
    if (start !== null) {
      // F-2026-06-15-M-49: read camera from ref so consecutive
      // mousemove events during a single drag all see the same
      // baseline (otherwise every event re-bases against the
      // just-committed camera and the cursor "races" the grid).
      const cam = cameraRef.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      // F-2026-06-15-M-48: setCamera here triggers a full EditorViewport
      // re-render — every cell, pickup, enemy, and SVG path node
      // re-evaluates with the new transform. The grid is 50×50 max
      // (2500 cells) and most cells have no per-instance state, so the
      // reconciliation cost is small enough to be imperceptible at
      // 60 fps. Trade-off accepted: avoid a parallel ref-driven
      // imperative DOM update path until profiling shows the
      // current approach is a real bottleneck. The M-51 GridCell memo
      // helps too: static cells bail out of re-render entirely.
      setCamera({ x: cam.x + dx / cam.zoom, y: cam.y + dy / cam.zoom });
      panStateRef.current = { x: e.clientX, y: e.clientY };
      handleFirstPan();
      return;
    }
    // Update the ref imperatively so the readout (a separate child)
    // can read it without forcing the whole grid to re-render.
    // Use truthy check rather than `!== undefined` — Number('') is 0,
    // not NaN, so an empty data-x would silently snap hover to (0,0).
    const target = e.target as HTMLElement | null;
    if (target?.dataset?.x && target.dataset.z) {
      const x = Number(target.dataset.x);
      const z = Number(target.dataset.z);
      if (!Number.isNaN(x) && !Number.isNaN(z)) {
        const prev = hoverCellRef.current;
        if (!prev || prev.x !== x || prev.z !== z) {
          hoverCellRef.current = { x, z };
          setHoverCellTick((t) => t + 1);
        }
        return;
      }
    }
    if (hoverCellRef.current !== null) {
      hoverCellRef.current = null;
      setHoverCellTick((t) => t + 1);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (tool === 'pan') {
      if (e.button === 0 || e.button === 2) panStateRef.current = null;
    } else if (e.button === 2) {
      panStateRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
  };

  const handleMouseLeave = (): void => {
    if (hoverCellRef.current !== null) {
      hoverCellRef.current = null;
      setHoverCellTick((t) => t + 1);
    }
  };

  // Click on the dark canvas area around the grid (not on a cell) →
  // drop the current selection so the right panel jumps back to the
  // level-metadata form. Cell clicks are routed by handleCellClick and
  // will have set/changed the selection already; this handler only
  // fires for "empty space" clicks. We compare mousedown vs mouseup
  // coordinates so a pan drag (which is also a click on this same
  // element) doesn't accidentally clear the selection at drag-end.
  const canvasClickRef = useRef<{ x: number; y: number } | null>(null);
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Track the press position; we only want to treat <5px movement as
    // a click. Anything larger is a drag (pan / rubber-band).
    if (e.button !== 0) {
      canvasClickRef.current = null;
      return;
    }
    canvasClickRef.current = { x: e.clientX, y: e.clientY };
  };
  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLDivElement>): void => {
    const start = canvasClickRef.current;
    canvasClickRef.current = null;
    if (start === null) return;
    if (e.button !== 0) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > 25) return; // dragged > 5px — not a click
    // Click target must be the viewport bg, not a grid cell. Cells set
    // data-x / data-z; the bg does not.
    const target = e.target as HTMLElement | null;
    if (target?.dataset?.x && target.dataset.z) return;
    // Also skip if the user just panned (panStateRef is set during a
    // pan gesture and cleared on mouseup). The viewport's own
    // handleMouseDown/Up track that — this guard is a belt-and-suspenders
    // against a touch / trackpad click that doesn't move enough pixels
    // but was actually a pan.
    if (panStateRef.current !== null) return;
    if (selection !== null) clearSelection();
  };

  const handleFirstPan = (): void => {
    if (!hasPanned) setHasPanned(true);
  };

  // F-2026-06-15-M-52: gridWidth / gridHeight / transform moved into
  // <GridBody> so the camera/transform subscription lives with the
  // grid surface it transforms. EditorViewport still needs `width` /
  // `depth` for the minimap and the empty-state hint.
  const { width, depth } = level.size;

  const isEmpty =
    level.walls.every((row) => row.every((c) => c === 0)) &&
    level.pickups.length === 0 &&
    level.enemies.length === 0;

  return (
    <div className="editor-viewport-shell" data-testid="editor-viewport-shell">
      <div className="editor-viewport-bg" aria-hidden />

      {/* F-P2-9: top-right `?` toggle button. Opens the cheat-sheet
          drawer with full tool / shortcut / workflow / checklist docs.
          The button is absolutely positioned inside the viewport
          shell so it tracks the viewport regardless of the sidebar
          widths. */}
      <button
        type="button"
        data-testid="editor-help-toggle"
        aria-label={helpOpen ? t('editor.help.closeAria') : t('editor.help.title')}
        aria-pressed={helpOpen}
        title={t('editor.help.title')}
        className="editor-help-toggle"
        onClick={() => setHelpOpen((v) => !v)}
      >
        ?
      </button>

      <div
        data-testid="editor-viewport"
        id="editor-viewport"
        ref={viewportRef}
        onMouseDown={(e) => {
          handleMouseDown(e);
          handleCanvasMouseDown(e);
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={(e) => {
          handleMouseUp(e);
          handleCanvasMouseUp(e);
        }}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          cursor: tool === 'pan' ? (panStateRef.current ? 'grabbing' : 'grab') : 'default',
          userSelect: 'none',
        }}
      >
        <GridBody
        level={level}
        selection={selection}
        tool={tool}
        isCellSelected={isCellSelected}
        onCellClick={handleCellClick}
      />
      </div>

      {isEmpty && (
        <div className="editor-viewport-empty" data-testid="editor-viewport-empty">
          <div>{t('editor.viewport.empty')}</div>
          <div className="editor-viewport-empty__accent">{t('editor.viewport.emptySub')}</div>
        </div>
      )}

      {tool === 'pan' && !hasPanned && (
        <div className="editor-viewport-pan-hint" data-testid="editor-viewport-pan-hint">
          <div className="editor-viewport-pan-hint__icon" aria-hidden>✥</div>
          {/* F-2026-06-18: wrap title / body / sub in a text column so
              the icon stays on the left and the copy stacks tightly on
              the right — the old full-canvas vertical stack made the
              labels visually run together. */}
          <div className="editor-viewport-pan-hint__text">
            <div className="editor-viewport-pan-hint__title">{t('editor.viewport.panHintTitle')}</div>
            <div className="editor-viewport-pan-hint__body">
              {t('editor.viewport.panHintDrag')}
            </div>
            <div className="editor-viewport-pan-hint__sub">{t('editor.viewport.panHintSub')}</div>
          </div>
        </div>
      )}

      <HoverReadout
        hoverRef={hoverCellRef}
        tick={hoverCellTick}
        width={width}
        depth={depth}
      />

      <div className="editor-viewport-zoom" data-testid="editor-viewport-zoom">
        <button
          type="button"
          className="editor-viewport-zoom__btn"
          aria-label={t('editor.viewport.zoomOutAria')}
          disabled={camera.zoom <= ZOOM_MIN}
          onClick={() => setCamera({ zoom: Math.max(ZOOM_MIN, camera.zoom - ZOOM_STEP) })}
        >
          −
        </button>
        <div className="editor-viewport-zoom__value" aria-live="polite">
          {(camera.zoom * 100).toFixed(0)}%
        </div>
        <button
          type="button"
          className="editor-viewport-zoom__btn"
          aria-label={t('editor.viewport.zoomInAria')}
          disabled={camera.zoom >= ZOOM_MAX}
          onClick={() => setCamera({ zoom: Math.min(ZOOM_MAX, camera.zoom + ZOOM_STEP) })}
        >
          +
        </button>
      </div>

      <div className="editor-viewport-minimap" data-testid="editor-viewport-minimap" aria-label={t('editor.viewport.minimapAria')}>
        <div className="editor-viewport-minimap__title">
          Map {width}×{depth}
        </div>
        <div className="editor-viewport-minimap__grid">
          {Array.from({ length: depth }, (_, z) =>
            Array.from({ length: width }, (_, x) => {
              const isWall = level.walls[z]?.[x] === 1;
              const isStart = level.start.x === x && level.start.z === z;
              const isExit = level.exit.x === x && level.exit.z === z;
              if (!isWall && !isStart && !isExit) return null;
              const className = isStart
                ? 'editor-viewport-minimap__cell editor-viewport-minimap__cell--start'
                : isExit
                  ? 'editor-viewport-minimap__cell editor-viewport-minimap__cell--exit'
                  : 'editor-viewport-minimap__cell';
              return (
                <div
                  key={cellKey(x, z)}
                  className={className}
                  style={minimapCellStyle(x, z, width, depth)}
                />
              );
            }),
          )}
        </div>
      </div>

      {/* F-P2-9: cheat-sheet drawer. Re-renders on language change
          because every string flows through useT(). */}
      <EditorHelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

// GridCell: one tile of the editor grid. Memoized so a 50×50 grid
// (2500 cells) only re-renders the cells whose props actually
// changed when the parent commits a new selection / tool state.
// F-2026-06-15-M-51/M-53: extracted from the inline JSX in
// EditorViewport and given role/aria-label for screen readers.
interface GridCellProps {
  x: number;
  z: number;
  isWall: boolean;
  isStart: boolean;
  isExit: boolean;
  selected: boolean;
  tool: EditorTool;
  onCellClick: (x: number, z: number) => void;
}
const GridCell = memo(function GridCell({
  x,
  z,
  isWall,
  isStart,
  isExit,
  selected,
  tool,
  onCellClick,
}: GridCellProps): React.ReactElement {
  // F-2026-06-15-M-53: human-readable label for assistive tech.
  // Walls are usually the interesting thing; the start/exit markers
  // are the navigational anchor points; floor cells get a generic
  // "open" label.
  let label: string;
  if (isStart) label = `Start cell ${x},${z}`;
  else if (isExit) label = `Exit cell ${x},${z}`;
  else if (isWall) label = `Wall cell ${x},${z}`;
  else label = `Open cell ${x},${z}`;
  if (selected) label = `${label} (selected)`;
  return (
    <div
      data-x={x}
      data-z={z}
      data-testid={`cell-${x}-${z}`}
      data-wall={isWall ? 1 : 0}
      data-start={isStart ? 1 : 0}
      data-exit={isExit ? 1 : 0}
      role="gridcell"
      aria-label={label}
      aria-selected={selected}
      onClick={() => onCellClick(x, z)}
      style={{
        position: 'relative',
        width: CELL_SIZE,
        height: CELL_SIZE,
        background: isWall ? WALL_COLOR : FLOOR_COLOR,
        borderRadius: 2,
        outline: selected ? '2px solid var(--accent)' : 'none',
        outlineOffset: '-2px',
        cursor: tool === 'pan' ? 'inherit' : 'pointer',
        zIndex: 1,
        boxShadow: isWall ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
      }}
    >
      {isStart && <StartMarker x={x} z={z} />}
      {isExit && <ExitMarker x={x} z={z} />}
    </div>
  );
});

// GridBody: the entire grid surface (cells + pickups + enemy paths +
// enemy markers) as a single memoized component. F-2026-06-15-M-52:
// before the extraction, every editor store update re-rendered the
// full 50×50 cell matrix and re-evaluated the pickup / enemy maps
// inline — a single selection toggle re-evaluated 2500 isWall /
// isStart / isExit checks. Wrapping the body in React.memo with
// shallow-equal prop comparison means a non-grid store update
// (e.g. dirty flag toggle, hoverCellTick increment) skips the entire
// grid; a grid update still re-runs the inner loops, but the parent
// EditorViewport commit and DOM reconciliation stays the same. The
// companion GridCell memo (M-51) handles the per-cell bail-out.
interface GridBodyProps {
  level: MazeData;
  selection: EditorSelection | null;
  tool: EditorTool;
  isCellSelected: (x: number, z: number) => boolean;
  onCellClick: (x: number, z: number) => void;
}
const GridBody = memo(function GridBody({
  level,
  selection,
  tool,
  isCellSelected,
  onCellClick,
}: GridBodyProps): React.ReactElement {
  const { width, depth } = level.size;
  const gridWidth = width * CELL_SIZE;
  const gridHeight = depth * CELL_SIZE;
  const camera = useEditorStore((s) => s.camera);
  const transform = `translate(calc(-50% + ${camera.x}px), calc(-50% + ${camera.y}px)) scale(${camera.zoom})`;

  return (
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
            // F-2026-06-15-M-51/M-53: extracted the per-cell render
            // into a memoized <GridCell> so a 50×50 grid (2500
            // cells) doesn't re-reconcile every cell on every
            // store update. React.memo's default shallow compare
            // short-circuits cells whose props (wall/start/exit/
            // selected/onClick identity) are unchanged. Combined
            // with M-52 (memoizing the body wrapper), a single
            // selection toggle now only re-renders the one cell
            // that flipped + the GridCell wrapper itself.
            //
            // The same change adds role/aria-label so screen
            // readers see "Cell 7,3 — wall" / "Cell 0,0 — start
            // marker" instead of a wall of unlabelled divs. The
            // role is "gridcell" to match the implicit grid role
            // on the parent <div data-testid="editor-grid">.
            <GridCell
              key={cellKey(x, z)}
              x={x}
              z={z}
              isWall={isWall}
              isStart={isStart}
              isExit={isExit}
              selected={selected}
              tool={tool}
              onCellClick={onCellClick}
            />
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
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              pointerEvents: 'none',
              outline: selected ? '2px solid var(--accent)' : 'none',
              outlineOffset: '-2px',
              zIndex: 2,
              textShadow: '0 1px 0 rgba(0,0,0,0.4)',
            }}
          >
            {p.type === 'time' ? '⏱' : p.type === 'health' ? '♥' : '⚷'}
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
        <defs>
          <marker
            id="enemy-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill={ENEMY_COLOR} />
          </marker>
        </defs>
        {level.enemies.map((e) => (
          <polyline
            key={`path-${e.id}`}
            data-testid={`path-${e.id}`}
            points={pathPointsAttr(e.path)}
            fill="none"
            stroke={ENEMY_COLOR}
            strokeWidth={1.5}
            strokeDasharray="3 2"
            markerEnd="url(#enemy-arrow)"
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
              stroke="#0c0d12"
              strokeWidth={1}
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
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: ENEMY_COLOR,
                border: '2px solid #0c0d12',
                boxShadow: '0 0 0 1px ' + ENEMY_COLOR,
              }}
            />
          </div>
        );
      })}
    </div>
  );
});
function HoverReadout({
  hoverRef,
  tick,
  width,
  depth,
}: {
  hoverRef: React.MutableRefObject<{ x: number; z: number } | null>;
  tick: number;
  width: number;
  depth: number;
}): React.ReactElement {
  // tick is the dependency; the actual cell value lives in the ref.
  void tick;
  const cell = hoverRef.current;
  return (
    <div className="editor-viewport-readout" data-testid="editor-viewport-readout">
      <span>
        <span className="editor-viewport-readout__label">X</span>{' '}
        <span className="editor-viewport-readout__value">
          {cell ? String(cell.x).padStart(2, '0') : '—'}
        </span>
      </span>
      <span>
        <span className="editor-viewport-readout__label">Z</span>{' '}
        <span className="editor-viewport-readout__value">
          {cell ? String(cell.z).padStart(2, '0') : '—'}
        </span>
      </span>
      <span className="editor-viewport-readout__divider" aria-hidden />
      <span>
        <span className="editor-viewport-readout__label">Grid</span>{' '}
        <span className="editor-viewport-readout__value">
          {width}×{depth}
        </span>
      </span>
    </div>
  );
}

// Start marker: filled green dot with expanding ring. Communicates "entry".
function StartMarker({ x, z }: { x: number; z: number }): React.ReactElement {
  return (
    <span
      data-testid={`start-${x}-${z}`}
      style={{
        position: 'absolute',
        top: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: 'var(--ok)',
        boxShadow: '0 0 0 2px rgba(62,196,109,0.35)',
        pointerEvents: 'none',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: -3,
          borderRadius: '50%',
          border: '1px solid var(--ok)',
          animation: 'editor-port-pulse 1.8s ease-out infinite',
        }}
      />
    </span>
  );
}

// Exit marker: a small red flag (pennant on a pole). Inline SVG so the
// shape stays sharp at any zoom and the silhouette reads as a flag
// rather than a generic marker. The pole casts a faint shadow to lift
// it off the floor cell visually.
function ExitMarker({ x, z }: { x: number; z: number }): React.ReactElement {
  return (
    <svg
      data-testid={`exit-${x}-${z}`}
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
      style={{
        position: 'absolute',
        top: 3,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        overflow: 'visible',
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))',
      }}
    >
      {/* Pole */}
      <line
        x1={6}
        y1={3}
        x2={6}
        y2={22}
        stroke="#ff5252"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      {/* Pennant (triangular flag) */}
      <path
        d="M6 3 L21 7.5 L6 12 Z"
        fill="#ff5252"
        stroke="#ff5252"
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
      {/* Pole base cap */}
      <circle cx={6} cy={22} r={1.4} fill="#ff5252" />
    </svg>
  );
}
