import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { EditorTool, EnemySpawn, MazeData, Pickup, PickupType, Trap, Door, VerticalTransition, TransitionKind } from '../../maze/types';
import { isTransitionTool } from '../../maze/types';
import type { EditorSelection } from '../../store/editorStore';
import { EditorHelpDrawer } from './EditorHelpDrawer';
import { useT } from '../../i18n';
import { getCurrentLayerWalls } from '../../utils/perLayerWalls';

// CSS-side counterpart of src/entities/Pickup.ts PICKUP_COLORS, so the
// editor matches the 3D view's per-type palette without importing three.
const PICKUP_CSS_COLOR: Record<PickupType, string> = {
  time: '#ffd84d',
  health: '#ff5050',
  key: '#5fa8ff',
};
// F-2026-07-01-L-2: centralized color constants imported from utils/colors.ts
// instead of locally duplicated.
import { TRAP_CSS_COLOR, KEY_COLOR_CSS } from '../../utils/colors';
const ENEMY_COLOR = '#ff8a3d';
const WALL_COLOR = '#1d1f27';
const FLOOR_COLOR = '#e0e0ea';
// P3-1c: per-kind transition glyph color. Each kind gets a distinct
// hue so the user can tell at a glance which transition is which;
// the kind label is also rendered inside the glyph (see
// `TransitionGlyph`) so the textual mapping stays in sync.
const TRANSITION_COLOR: Record<TransitionKind, string> = {
  'stair-up': '#7ed957',
  'stair-down': '#5fa8ff',
  'hole-down': '#c95cff',
  'hole-up': '#ff5252',
  ladder: '#ffd84d',
};
// P3-1c: short single-character label for each transition kind.
// The full label lives in the toolbar tool label + the properties
// panel kind dropdown; the glyph shows a single-character tag so
// the cell stays readable.
const TRANSITION_GLYPH: Record<TransitionKind, string> = {
  'stair-up': '↑',
  'stair-down': '↓',
  'hole-down': '⦵',
  'hole-up': '⦴',
  ladder: '║',
};
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
  // P2-18: trap and door cell lookups for selection + glyph rendering.
  trapByCell: Map<string, Trap>;
  doorByCell: Map<string, Door>;
  // P3-1c: per-cell transition lookup, filtered to the editor's
  // current layer. The viewport uses this to (a) drive the
  // transition glyph render and (b) route select-tool clicks to
  // the `transition` selection kind. The full
  // `level.transitions` array still drives the always-visible
  // ghosted-overlay rendering (see `allTransitions` below) so the
  // user can see cross-layer connections even while editing a
  // different layer.
  transitionByCell: Map<string, VerticalTransition>;
}

function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

function buildLookups(
  level: { pickups: Pickup[]; enemies: EnemySpawn[]; traps: Trap[]; doors: Door[]; transitions?: VerticalTransition[] },
  currentLevel: number,
): CellLookup {
  const pickupByCell = new Map<string, Pickup>();
  for (const p of level.pickups) {
    // P3-1c: per-layer entity filter. Entities on other layers
    // are not selectable / not pickable from this layer's tab.
    // The walls grid is intentionally shared across layers in
    // P3-1a (P3-1b will add per-layer walls) so we only filter
    // entity-bearing props.
    if ((p.level ?? 0) !== currentLevel) continue;
    pickupByCell.set(cellKey(p.x, p.z), p);
  }
  const enemyByCell = new Map<string, EnemySpawn>();
  for (const e of level.enemies) {
    if ((e.level ?? 0) !== currentLevel) continue;
    enemyByCell.set(cellKey(e.x, e.z), e);
  }
  // P2-18: trap and door cell lookups.
  const trapByCell = new Map<string, Trap>();
  for (const t of level.traps) {
    if ((t.level ?? 0) !== currentLevel) continue;
    trapByCell.set(cellKey(t.x, t.z), t);
  }
  const doorByCell = new Map<string, Door>();
  for (const d of level.doors) {
    if ((d.level ?? 0) !== currentLevel) continue;
    doorByCell.set(cellKey(d.x, d.z), d);
  }
  // P3-1c: per-layer transition lookup. Like the other entity
  // maps, this is filtered to the editor's currentLevel — but
  // the grid body renders the full `transitions` array as a
  // ghosted overlay so the user can see the cross-layer
  // structure even while on a different layer.
  const transitionByCell = new Map<string, VerticalTransition>();
  for (const tr of level.transitions ?? []) {
    if (tr.level !== currentLevel) continue;
    transitionByCell.set(cellKey(tr.x, tr.z), tr);
  }
  return { pickupByCell, enemyByCell, trapByCell, doorByCell, transitionByCell };
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
  // P2-18: trap and door placement actions.
  const placeTrap = useEditorStore((s) => s.placeTrap);
  const placeDoor = useEditorStore((s) => s.placeDoor);
  // P3-1c: transition placement. The toolbar's 5 new tools
  // (stair-up / stair-down / hole-down / hole-up / ladder) all
  // route through this single action; the `kind` is the active
  // tool's literal. Per-level filtering of visible transitions
  // lives below in `buildLookups` — see `transitionByCell`.
  const placeTransition = useEditorStore((s) => s.placeTransition);
  const select = useEditorStore((s) => s.select);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const setTool = useEditorStore((s) => s.setTool);
  // P3-1c: subscribe to the editor's currentLevel so a layer
  // change re-renders the viewport. The viewport re-derives the
  // per-layer entity filter from this; the level-tab bar in the
  // left panel is a separate selector that re-renders the
  // highlight on the same value.
  const currentLevel = useEditorStore((s) => s.currentLevel);

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

  const { pickupByCell, enemyByCell, trapByCell, doorByCell, transitionByCell } = useMemo(
    () => buildLookups(level, currentLevel),
    [level, currentLevel],
  );
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
      // P2-18: trap and door selection branches.
      if (selection.kind === 'trap') {
        const t = trapByCell.get(cellKey(x, z));
        return t ? t.id === selection.id : false;
      }
      if (selection.kind === 'door') {
        const d = doorByCell.get(cellKey(x, z));
        return d ? d.id === selection.id : false;
      }
      // P3-1c: transition selection branch.
      if (selection.kind === 'transition') {
        const tr = transitionByCell.get(cellKey(x, z));
        return tr ? tr.id === selection.id : false;
      }
      return false;
    },
    [selection, pickupByCell, enemyByCell, trapByCell, doorByCell, transitionByCell],
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
      // P2-18: select trap or door on click.
      const trap = trapByCell.get(cellKey(x, z));
      if (trap) {
        select({ kind: 'trap', id: trap.id });
        return;
      }
      const door = doorByCell.get(cellKey(x, z));
      if (door) {
        select({ kind: 'door', id: door.id });
        return;
      }
      // P3-1c: select a transition on the current level. Transitions
      // on other levels are still rendered (so the user can see the
      // cross-layer connection) but they don't pick-select — that
      // would be confusing because the properties panel's editable
      // fields are the same across all layers and clicking an L2
      // transition while the L1 tab is active would surface a
      // non-L1 transition's properties. A future P3-N could add
      // "auto-switch to that layer on select" but it's a UX call
      // the current spec doesn't make.
      const transition = transitionByCell.get(cellKey(x, z));
      if (transition) {
        select({ kind: 'transition', id: transition.id });
        return;
      }
      // P5-editor-multilayer: click on a wall cell selects it on
      // the current layer. Multi-layer levels read `walls2d[currentLevel]`
      // via the helper; the strict mutex keeps the lookups safe.
      const layerWalls = getCurrentLayerWalls(level, currentLevel);
      if (layerWalls[z]?.[x] === 1) {
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
    }
    // P2-18: trap and door placement.
    else if (tool === 'trap') placeTrap(x, z);
    else if (tool === 'door') placeDoor(x, z);
    // P3-1c: 5 transition tools all route to the same `placeTransition`
    // action with the tool literal as the `kind`. `isTransitionTool`
    // narrows the union to `TransitionTool` so the cast below is
    // type-checked; a future tool added to the toolbar without being
    // registered here would fail to compile (the `never` check at
    // the bottom of the chain still pins exhaustiveness).
    else if (isTransitionTool(tool)) {
      placeTransition(tool as TransitionKind, x, z);
    }
    else {
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
    // P5-editor-multilayer: empty-state check operates on the
    // current layer's grid. A level can be empty on L0 and
    // non-empty on L1 (or vice versa) — the empty hint should
    // track the layer the user is currently looking at, not the
    // whole level.
    getCurrentLayerWalls(level, currentLevel).every((row) => row.every((c) => c === 0)) &&
    level.pickups.length === 0 &&
    level.enemies.length === 0 &&
    level.traps.length === 0 &&
    level.doors.length === 0;

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
        currentLevel={currentLevel}
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
              // P5-editor-multilayer: minimap renders the current
              // layer's grid. The 2D minimap inherits the per-
              // layer rendering from the main grid below.
              const layerWalls = getCurrentLayerWalls(level, currentLevel);
              const isWall = layerWalls[z]?.[x] === 1;
              const isStart = level.start.x === x && level.start.z === z;
              const isExit = level.exit.x === x && level.exit.z === z;
              // P2-18: trap and door minimap pixels.
              const trap = trapByCell.get(cellKey(x, z));
              const door = doorByCell.get(cellKey(x, z));
              if (!isWall && !isStart && !isExit && !trap && !door) return null;
              let className: string;
              if (isStart) className = 'editor-viewport-minimap__cell editor-viewport-minimap__cell--start';
              else if (isExit) className = 'editor-viewport-minimap__cell editor-viewport-minimap__cell--exit';
              else if (trap) className = `editor-viewport-minimap__cell editor-viewport-minimap__cell--trap-${trap.kind}`;
              else if (door) className = 'editor-viewport-minimap__cell editor-viewport-minimap__cell--door';
              else className = 'editor-viewport-minimap__cell';
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
  // P3-1c: layer context for the transition overlay. Transitions
  // on the current layer render opaque (and are pickable via the
  // select tool / selectable in the properties panel); transitions
  // on other layers render as a half-opacity ghost with a layer
  // tag, so the user can see the cross-layer structure even while
  // editing a different layer. P3-1b will swap the ghost for the
  // real inter-layer rendering once the engine supports it.
  currentLevel: number;
}
const GridBody = memo(function GridBody({
  level,
  selection,
  tool,
  isCellSelected,
  onCellClick,
  currentLevel,
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
          // P5-editor-multilayer: the main grid paints the current
          // layer's walls. The `currentLevel` selector above
          // (line 173) drives both this re-render and the layer
          // tab highlight, so a tab click re-paints immediately.
          const layerWalls = getCurrentLayerWalls(level, currentLevel);
          const isWall = layerWalls[z]?.[x] === 1;
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

      {/* P2-18: trap glyphs — fire (warm orange disc) and water (cool blue disc). */}
      {level.traps.map((t) => {
        const selected = selection?.kind === 'trap' && selection.id === t.id;
        return (
          <div
            key={t.id}
            data-testid={`trap-${t.id}`}
            data-trap-kind={t.kind}
            style={{
              position: 'absolute',
              left: t.x * CELL_SIZE,
              top: t.z * CELL_SIZE,
              width: CELL_SIZE,
              height: CELL_SIZE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              outline: selected ? '2px solid var(--accent)' : 'none',
              outlineOffset: '-2px',
              zIndex: 2,
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: TRAP_CSS_COLOR[t.kind],
                border: '2px solid #0c0d12',
                opacity: 0.85,
              }}
            />
          </div>
        );
      })}

      {/* P2-18: door glyphs — colored rectangle matching the key color. */}
      {level.doors.map((d) => {
        const selected = selection?.kind === 'door' && selection.id === d.id;
        return (
          <div
            key={d.id}
            data-testid={`door-${d.id}`}
            data-door-key-color={d.keyColor}
            style={{
              position: 'absolute',
              left: d.x * CELL_SIZE,
              top: d.z * CELL_SIZE,
              width: CELL_SIZE,
              height: CELL_SIZE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              outline: selected ? '2px solid var(--accent)' : 'none',
              outlineOffset: '-2px',
              zIndex: 2,
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 18,
                height: 14,
                borderRadius: 2,
                background: KEY_COLOR_CSS[d.keyColor],
                border: '2px solid #0c0d12',
              }}
            />
          </div>
        );
      })}

      {/* P3-1c: vertical-transition glyphs. Each transition's
          source-layer dictates the rendering style:
            - on the editor's current level → full opacity, the
              cell-level glyph doubles as a click target for the
              select tool (handled by the parent viewport's
              handleCellClick) and the properties panel can edit
              it;
            - on any other level → half-opacity ghost with a
              "L{n}" tag so the user can see the cross-layer
              connection even while editing a different layer.
          The ghost layer does NOT block the cell click (the cell
          below it still owns the click; the ghost is `pointerEvents:
          none`). The "current level" version is also
          pointer-events:none because the cell is the click target;
          the select tool's handleCellClick reads from
          `transitionByCell` (built by the parent) and routes to
          the `transition` selection kind. */}
      {(level.transitions ?? []).map((tr) => {
        const onCurrentLayer = tr.level === currentLevel;
        const selected = selection?.kind === 'transition' && selection.id === tr.id;
        return (
          <div
            key={tr.id}
            data-testid={`transition-${tr.id}`}
            data-transition-kind={tr.kind}
            data-transition-level={tr.level}
            data-transition-to-level={tr.toLevel}
            style={{
              position: 'absolute',
              left: tr.x * CELL_SIZE,
              top: tr.z * CELL_SIZE,
              width: CELL_SIZE,
              height: CELL_SIZE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              outline: selected ? '2px solid var(--accent)' : 'none',
              outlineOffset: '-2px',
              zIndex: 2,
              opacity: onCurrentLayer ? 1 : 0.4,
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: 4,
                background: TRANSITION_COLOR[tr.kind],
                border: '2px solid #0c0d12',
                color: '#0c0d12',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {TRANSITION_GLYPH[tr.kind]}
            </span>
            {!onCurrentLayer && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 1,
                  right: 1,
                  fontSize: 8,
                  fontFamily: 'var(--font-mono)',
                  background: 'rgba(12,13,18,0.7)',
                  color: '#fff',
                  padding: '1px 3px',
                  borderRadius: 2,
                }}
              >
                L{tr.level + 1}
              </span>
            )}
          </div>
        );
      })}

      {/* P3-1c: cross-layer connection lines. Drawn last so they
          sit above the entity glyphs; each transition's source cell
          on its own layer has a thin colored line connecting it to
          the toLevel's matching cell. The toLevel's cell is the
          landing point (default: same x/z; the optional toX/toZ
          are used here for a different landing coordinate). The
          opacity follows the source-layer's render style — full
          opacity for the current layer, ghosted otherwise. */}
      <svg
        data-testid="transition-lines"
        width={gridWidth}
        height={gridHeight}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        {(level.transitions ?? []).map((tr) => {
          const toX = tr.toX ?? tr.x;
          const toZ = tr.toZ ?? tr.z;
          return (
            <line
              key={`transition-line-${tr.id}`}
              data-testid={`transition-line-${tr.id}`}
              x1={tr.x * CELL_SIZE + CELL_SIZE / 2}
              y1={tr.z * CELL_SIZE + CELL_SIZE / 2}
              x2={toX * CELL_SIZE + CELL_SIZE / 2}
              y2={toZ * CELL_SIZE + CELL_SIZE / 2}
              stroke={TRANSITION_COLOR[tr.kind]}
              strokeWidth={2}
              strokeDasharray="4 3"
              opacity={tr.level === currentLevel ? 0.9 : 0.35}
            />
          );
        })}
      </svg>
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
