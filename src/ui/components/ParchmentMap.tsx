import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { MazeData } from '../../maze/types';
import { useGameStore } from '../../store/gameStore';
import { useT } from '../../i18n';
import { CLOSE_MAP_KEY, OPEN_MAP_KEY } from '../../engine/InputManager';
import type { DamageRegion, ParchmentState } from '../../engine/ParchmentState';
// P3-1: per-layer rendering replaces the legacy "flatten every
// layer into one stream" approach. The legacy helpers
// `getAllVisitedCells` and `hasVisitedAnyLevel` from
// `engine/ParchmentState.ts` are no longer imported here — the
// P3-1c draw loops read `parchment.visitedCells.get(viewingLevel)`
// directly so the per-level filtering is the source of truth, not
// a flattened fallback. They remain exported from the engine for
// any future consumer that genuinely wants the cross-layer union
// (e.g. an E2E debug overlay).
import { useFocusRestore, useFocusTrap } from './modalHooks';
import styles from './ParchmentMap.module.css';

// F-2026-06-30: P2-16 — fullscreen modal that shows the player's
// hand-drawn parchment. The component owns:
//   1. Modal chrome (backdrop, close button, hint text).
//   2. Canvas drawing — procedural parchment background, walls
//      (cached on first mount), visited cells, start/exit markers,
//      pickups, and damage regions.
//   3. ESC + close-button bindings.
//
// The component subscribes to gameStore.parchment (the full
// reference) so any change to visitedCells / damageRegions / isOpen
// triggers a single re-render. The canvas redraw is driven by a
// useEffect that depends on the same reference; we don't try to be
// clever about per-cell re-renders because the canvas is < 1 ms for
// any level size in the supported range (≤ 50x50).

interface ParchmentMapProps {
  maze: MazeData;
}

function ParchmentMapImpl({ maze }: ParchmentMapProps): React.ReactElement | null {
  const t = useT();
  const parchment = useGameStore((s) => s.parchment);
  const closeParchment = useGameStore((s) => s.closeParchment);
  // P3-1: §6.3 — viewing-level state. Defaults to the player's
  // current layer when the modal opens so a player climbing
  // stairs sees L3 first, not L1. The state is local (not in
  // the store) because the parchment is a read-only inspection
  // tool — there's no engine state to mirror. Tab-key cycling
  // and tab-bar clicks mutate this state.
  const playerCurrentLevel = useGameStore((s) => s.player?.currentLevel ?? 0);
  const [viewingLevel, setViewingLevel] = useState<number>(playerCurrentLevel);
  // P3-1: re-sync `viewingLevel` to the player's current level
  // whenever the modal re-opens. Without this effect, a player
  // who closed the modal on L3 and reopened on a fresh level
  // would see the stale L3 tab highlighted (or, in the
  // single-layer case, see L1 highlighted correctly). We
  // detect "just opened" by watching `parchment.isOpen` flip
  // from false → true and re-seeding viewingLevel. Closing
  // the modal does NOT reset viewingLevel so a player who
  // closed on L3 and immediately reopened sees L3 again.
  const wasOpenRef = useRef<boolean>(parchment.isOpen);
  useEffect(() => {
    if (parchment.isOpen && !wasOpenRef.current) {
      setViewingLevel(playerCurrentLevel);
    }
    wasOpenRef.current = parchment.isOpen;
  }, [parchment.isOpen, playerCurrentLevel]);
  // F-2026-06-30: P2-16 — ref to the modal frame so the focus trap
  // can scope Tab/Shift+Tab to the modal chrome (header + close
  // button) and the canvas element. We trap on the frame rather
  // than the backdrop so the trap doesn't see the inert game world.
  const frameRef = useRef<HTMLDivElement | null>(null);
  // F-2026-06-30: P2-16 — both hooks are no-ops until the modal
  // actually opens, so they're safe to call unconditionally above
  // the early-return.
  useFocusTrap(frameRef, parchment.isOpen);
  useFocusRestore(parchment.isOpen);

  // P3-1: §6.3 — Tab-key cycling. While the modal is open, a
  // Tab keypress advances the viewing level (0 → 1 → ...
  // → levelCount-1 → 0). We use the document-level keydown
  // listener because the focus-trap inside the modal
  // (`useFocusTrap` above) would otherwise consume Tab to
  // cycle focus, and we want the Tab key to mean "next
  // level" instead. We don't preventDefault on focus
  // navigation explicitly — the focus-trap handles its own
  // Tab behaviour and our document-level listener runs after
  // it, so the two don't fight (we only run when the modal
  // is open and `parchment.isOpen` is true).
  const levelCount = maze.levelCount ?? 1;
  useEffect(() => {
    if (!parchment.isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      setViewingLevel((cur) => (cur + 1) % levelCount);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [parchment.isOpen, levelCount]);

  // F-2026-06-30: P2-16 — the modal is a sibling of the canvas, so
  // mount / unmount is keyed on `parchment.isOpen`. The render-null
  // guard handles the `minimapMode !== 'parchment'` case at the
  // GameCanvas layer; here we only bail on the open flag.
  if (!parchment.isOpen) return null;

  // P3-1: tab bar. One button per layer (L1..L{maze.levelCount}).
  // The currently-viewing tab carries `aria-current="page"` and a
  // distinctive style; clicking a tab moves viewingLevel. We use
  // inline styles (not the CSS module) because the module doesn't
  // ship tab-bar classes — the P3-1c workstream is the only owner
  // of this surface, so adding classes to a sibling file would
  // be premature.
  const tabs: React.ReactElement[] = [];
  for (let i = 0; i < levelCount; i++) {
    const isActive = i === viewingLevel;
    tabs.push(
      <button
        key={i}
        type="button"
        aria-current={isActive ? 'page' : undefined}
        data-testid={`parchment-tab-${i}`}
        data-active={isActive ? 'true' : 'false'}
        onClick={() => setViewingLevel(i)}
        style={{
          padding: '4px 10px',
          margin: '0 2px',
          border: '1px solid var(--parchment-border, #6a4a2a)',
          borderRadius: 3,
          background: isActive ? 'rgba(60, 30, 10, 0.85)' : 'rgba(255, 240, 200, 0.4)',
          color: isActive ? '#faf3e0' : '#3a2a1a',
          fontWeight: isActive ? 700 : 500,
          fontFamily: "'Georgia', 'SimSun', serif",
          fontSize: 13,
          cursor: 'pointer',
          minWidth: 36,
        }}
      >
        {t('overlays.parchment.levelTab', { level: i + 1 })}
      </button>,
    );
  }

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t('overlays.parchment.title')}
      data-testid="parchment-map"
    >
      <div ref={frameRef} className={styles.frame}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('overlays.parchment.title')}</h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={t('overlays.parchment.hint')}
            onClick={closeParchment}
            // F-2026-06-30: P2-16 — autoFocus so keyboard / screen
            // reader users land on a known interactive element
            // (the only one in the modal chrome) on open.
            autoFocus
            data-testid="parchment-close"
          >
            ✕
          </button>
        </header>
        {/* P3-1: level tab bar (L1..L{levelCount}). Sits between
            the header and the canvas so the visible map below
            it is unambiguous about which layer it represents. */}
        <div
          role="tablist"
          aria-label={t('overlays.parchment.title')}
          data-testid="parchment-tabs"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 8,
            paddingBottom: 4,
            borderBottom: '1px solid rgba(60, 30, 10, 0.2)',
          }}
        >
          {tabs}
        </div>
        <ParchmentCanvas maze={maze} parchment={parchment} viewingLevel={viewingLevel} />
        <footer className={styles.footer}>{t('overlays.parchment.hint')}</footer>
      </div>
    </div>
  );
}

// F-2026-06-30: P2-16 — canvas renderer. Procedural parchment
// texture is generated once (cached on the ref) and re-blitted on
// every state change. Damage regions are drawn last so they always
// obscure the underlying map data. The component memoizes the canvas
// element so a re-render of the modal (e.g. language switch) doesn't
// tear down the canvas context.
//
// P3-1: §6.3 — `viewingLevel` filters every layer-specific draw
// (visited cells, pickups, damage regions) to the currently
// selected tab. The canvas also paints a translucent gray "fog"
// over cells the player hasn't visited on the viewing level so a
// tab for a never-walked layer reads as "unexplored" at a glance.
const ParchmentCanvas = memo(function ParchmentCanvas({
  maze,
  parchment,
  viewingLevel,
}: {
  maze: MazeData;
  parchment: ParchmentState;
  viewingLevel: number;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // F-2026-06-30: P2-16 — cache the procedural parchment background
  // (no walls, no visited, no damage) on a hidden canvas. The first
  // useEffect run fills it; subsequent runs only redraw the dynamic
  // layers onto the visible canvas. Without the cache, generating
  // noise per frame would visibly stutter at 50x50.
  const bgCacheRef = useRef<HTMLCanvasElement | null>(null);
  // P3-1: pre-translate the badge strings via `useT()` (the
  // only way to read locale at the React layer) and feed them
  // into `drawUnexploredBadge` as plain strings. The hook
  // re-runs the parent on language switch; the canvas's
  // useEffect then re-draws with the new copy.
  const t = useT();

  // F-2026-06-30: P2-16 — re-render whenever the parchment reference
  // changes (visited grew, new damage region, etc.). maze.id is also
  // a dependency because the dimensions + walls + start/exit only
  // change at level boundaries.
  //
  // P3-1: `viewingLevel` is also a dep so a tab click repaints the
  // canvas (visited cells + fog + damage are all level-specific).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // F-2026-06-30: P2-16 — first-time background cache generation.
    // The visible canvas is sized to fit the modal area, but the
    // background cache is the SAME size (1:1 px mapping) so we can
    // drawImage() it in one shot. Generating noise per frame is the
    // main thing we want to avoid.
    if (!bgCacheRef.current) {
      bgCacheRef.current = createParchmentBackground(canvas.width, canvas.height);
    }
    const bg = bgCacheRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bg) ctx.drawImage(bg, 0, 0);

    // F-2026-06-30: P2-16 — compute the cell→px transform. We fit
    // the maze into the available canvas with a small margin.
    const margin = 16;
    const usableW = canvas.width - margin * 2;
    const usableH = canvas.height - margin * 2;
    const cellW = usableW / maze.size.width;
    const cellH = usableH / maze.size.depth;
    const cellSize = Math.min(cellW, cellH);
    const offsetX = (canvas.width - cellSize * maze.size.width) / 2;
    const offsetY = (canvas.height - cellSize * maze.size.depth) / 2;
    const toPx = (cellX: number, cellZ: number) => ({
      x: offsetX + cellX * cellSize,
      y: offsetY + cellZ * cellSize,
    });

    // P3-1: pull the current level's visited set once so the
    // draw loops can do a single O(1) `has` lookup per cell
    // (visited, fog, pickup draw) instead of re-querying the
    // parchment Map. The fallback empty set renders an
    // all-fog canvas, which is the correct UX for "viewing a
    // layer the player hasn't walked into yet".
    const levelVisited: ReadonlySet<string> = parchment.visitedCells.get(viewingLevel) ?? new Set<string>();

    drawWalls(ctx, maze, cellSize, toPx);
    drawStartExit(ctx, maze, cellSize, toPx);
    // P3-1: gray fog over every cell the player hasn't walked
    // into on the viewing level. Drawn BEFORE the visited
    // highlight so the highlight "punches through" the fog.
    // The fog also covers the start/exit markers (drawn just
    // above), so a player on L0 looking at L1 sees a totally
    // blank map — exactly the "未探索" affordance the spec
    // asks for.
    drawFog(ctx, maze, levelVisited, cellSize, toPx);
    drawVisitedForLevel(ctx, levelVisited, maze, cellSize, toPx);
    drawPickupsForLevel(ctx, maze, levelVisited, cellSize, toPx);
    drawDamageForLevel(ctx, parchment.damageRegions, viewingLevel, cellSize, toPx);
    // P3-1: "Unexplored" placeholder. Rendered last so it
    // sits above every other layer; only fires when the
    // viewing level has zero visited cells (the level
    // literally hasn't been walked into at all yet).
    if (levelVisited.size === 0) {
      drawUnexploredBadge(
        ctx,
        canvas.width,
        canvas.height,
        t('overlays.parchment.empty'),
        t('overlays.parchment.levelTab', { level: viewingLevel + 1 }),
      );
    }
  }, [maze, parchment, viewingLevel, t]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={480}
      className={styles.canvas}
      // F-2026-06-30: P2-16 — canvas has no DOM-level semantic
      // meaning for assistive tech. role="img" + aria-label expose
      // the map as a single labelled image so screen readers can
      // announce "Map of <level>" instead of skipping the region.
      role="img"
      aria-label={maze.name}
      data-testid="parchment-canvas"
      data-level={viewingLevel}
    />
  );
});

// ---------------------------------------------------------------------------
// Parchment drawing helpers
// ---------------------------------------------------------------------------

// F-2026-06-30: P2-16 — procedural parchment background. Generates
// a sepia base + a low-frequency noise overlay + a vignette. Cached
// on first call; same dimensions as the visible canvas. The noise
// is computed with a fixed seed so the texture is stable across
// re-renders (no flicker).
function createParchmentBackground(w: number, h: number): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  if (!ctx) return off;
  // Sepia base — pale parchment color with a slight vertical gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#d8c094');
  grad.addColorStop(1, '#a8825a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Pseudo-random noise — deterministic via the index, so the same
  // coordinates always produce the same grain. Cheap per-pixel write
  // because the cached canvas is reused.
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    // Mulberry32-like cheap noise from the index; visual quality is
    // fine for a parchment background.
    const n = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const v = (n < 0 ? n + 1 : n) * 24 - 12;
    img.data[i] = clampByte(img.data[i]! + v);
    img.data[i + 1] = clampByte(img.data[i + 1]! + v);
    img.data[i + 2] = clampByte(img.data[i + 2]! + v * 0.5);
  }
  ctx.putImageData(img, 0, 0);
  // Subtle vignette — darker edges, lighter center.
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) / 3, w / 2, h / 2, Math.max(w, h));
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(40,20,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  return off;
}

function clampByte(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  maze: MazeData,
  cellSize: number,
  toPx: (x: number, z: number) => { x: number; y: number },
): void {
  ctx.fillStyle = 'rgba(58, 42, 26, 0.85)';
  // P5-editor-multilayer: ParchmentMap renders the L0 grid only. The
  // parchment is a static "you-are-here" overlay (no layer
  // switcher) and the spec defers multi-layer parchment to P+.
  // Falls back to `walls2d[0]` for multi-layer levels per the
  // strict `walls xor walls2d` mutex (decision A5) — a 2D
  // multi-layer `MazeData` has `walls2d` only, no `walls`.
  const wallsL0 = maze.walls ?? maze.walls2d![0]!;
  for (let z = 0; z < maze.size.depth; z++) {
    for (let x = 0; x < maze.size.width; x++) {
      if (wallsL0[z]?.[x] === 1) {
        const p = toPx(x, z);
        ctx.fillRect(p.x, p.y, cellSize, cellSize);
      }
    }
  }
}

function drawStartExit(
  ctx: CanvasRenderingContext2D,
  maze: MazeData,
  cellSize: number,
  toPx: (x: number, z: number) => { x: number; y: number },
): void {
  const s = toPx(maze.start.x, maze.start.z);
  const e = toPx(maze.exit.x, maze.exit.z);
  ctx.fillStyle = '#2d6e3e';
  ctx.beginPath();
  ctx.moveTo(s.x + cellSize / 2, s.y + 4);
  ctx.lineTo(s.x + cellSize - 4, s.y + cellSize - 4);
  ctx.lineTo(s.x + 4, s.y + cellSize - 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a02020';
  ctx.font = `${Math.max(10, cellSize * 0.6)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', e.x + cellSize / 2, e.y + cellSize / 2);
}

// P3-1: §6.3 — highlight every visited cell on the currently
// viewing layer. Takes the level-scoped visited set
// (selected upstream by `parchment.visitedCells.get(viewingLevel)`)
// so the canvas never paints a cell that wasn't walked into on
// the selected layer. The legacy parchment used
// `getAllVisitedCells(parchment)` to flatten every layer into
// one stream; the P3-1 split into per-level filtering is the
// core UX signal the tab bar relies on.
function drawVisitedForLevel(
  ctx: CanvasRenderingContext2D,
  visited: ReadonlySet<string>,
  maze: MazeData,
  cellSize: number,
  toPx: (x: number, z: number) => { x: number; y: number },
): void {
  // F-2026-06-30: P2-16 — every visited cell gets a sepia-toned
  // highlight (slightly darker than the parchment background) to
  // mark "explored". Empty parchment + highlighted visited is the
  // central UX signal: you only see where you've been.
  ctx.fillStyle = 'rgba(120, 80, 40, 0.18)';
  for (const key of visited) {
    const [xStr, zStr] = key.split(',');
    const x = Number(xStr);
    const z = Number(zStr);
    if (x < 0 || x >= maze.size.width || z < 0 || z >= maze.size.depth) continue;
    const p = toPx(x, z);
    ctx.fillRect(p.x, p.y, cellSize, cellSize);
  }
}

// P3-1: §6.3 — gray fog over every cell the player hasn't walked
// into on the currently viewing layer. Drawn BEFORE the visited
// highlight (which "punches through" the fog) and BEFORE the
// pickup glyphs (so a pickup on an unvisited cell is hidden —
// same UX rule the legacy parchment had, just expressed as a
// paint order instead of an early-continue). The color is a
// muted gray with low alpha so the parchment texture still
// shows through, preserving the "old map" feel of the surface.
function drawFog(
  ctx: CanvasRenderingContext2D,
  maze: MazeData,
  visited: ReadonlySet<string>,
  cellSize: number,
  toPx: (x: number, z: number) => { x: number; y: number },
): void {
  // P3-1: skip the fog when the viewing level has been walked
  // into at least once. An all-visited level is the player's
  // home layer (the one they spawned on); a fog over the start
  // cell would be visually wrong (the player obviously knows
  // the start cell). The 0.4 alpha below still lets the
  // parchment's sepia tone show through, so even an
  // unvisited-only level doesn't feel like a black box.
  ctx.fillStyle = 'rgba(80, 80, 80, 0.4)';
  for (let z = 0; z < maze.size.depth; z++) {
    for (let x = 0; x < maze.size.width; x++) {
      if (visited.has(`${x},${z}`)) continue;
      const p = toPx(x, z);
      ctx.fillRect(p.x, p.y, cellSize, cellSize);
    }
  }
}

function drawPickupsForLevel(
  ctx: CanvasRenderingContext2D,
  maze: MazeData,
  visited: ReadonlySet<string>,
  cellSize: number,
  toPx: (x: number, z: number) => { x: number; y: number },
): void {
  // F-2026-06-30: P2-16 — pickups are only shown on visited cells.
  // A hand-drawn character marks the type (clock / heart / key).
  ctx.fillStyle = '#3a2a1a';
  ctx.font = `${Math.max(10, cellSize * 0.6)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const pickup of maze.pickups) {
    // P3-1: per-level check. The legacy code used
    // `hasVisitedAnyLevel` so a pickup was visible on the
    // parchment no matter which layer the player had walked
    // it on. With the level tab, pickups are now scoped to
    // the viewing layer — a pickup on L0 is hidden when the
    // tab is L1, matching the spec's per-level filtering
    // contract.
    if (!visited.has(`${pickup.x},${pickup.z}`)) continue;
    const p = toPx(pickup.x, pickup.z);
    const glyph = pickupGlyph(pickup.type);
    ctx.fillText(glyph, p.x + cellSize / 2, p.y + cellSize / 2);
  }
}

function pickupGlyph(type: MazeData['pickups'][number]['type']): string {
  switch (type) {
    case 'time':
      return '⌛';
    case 'health':
      return '♥';
    case 'key':
      return '⚷';
    default:
      return '·';
  }
}

// P3-1: §6.3 — damage regions are now per-layer (the engine
// stamps `region.level` at the time of the hit). The viewing
// layer's regions render; the others are hidden. Pre-P3-1 the
// canvas rendered every region regardless of layer; with the
// tab split, a burn mark on L0 wouldn't make sense when the
// tab is L1.
function drawDamageForLevel(
  ctx: CanvasRenderingContext2D,
  regions: readonly DamageRegion[],
  viewingLevel: number,
  cellSize: number,
  toPx: (x: number, z: number) => { x: number; y: number },
): void {
  // F-2026-06-30: P2-16 — three visual variants. Each occupies a
  // square footprint of `(2*radius+1) * cellSize` centered on the
  // region. The footprint is square (matching the spec's
  // square-rendering note) and rendered above the visited / pickup
  // layers so the player can't accidentally use information hidden
  // by a damage region.
  for (const r of regions) {
    if (r.level !== viewingLevel) continue;
    const p = toPx(r.cx, r.cz);
    const size = (r.radius * 2 + 1) * cellSize;
    const ox = p.x + cellSize / 2 - size / 2;
    const oy = p.y + cellSize / 2 - size / 2;
    switch (r.type) {
      case 'water':
        drawWaterStain(ctx, ox, oy, size, r.seed);
        break;
      case 'burn':
        drawBurnHole(ctx, ox, oy, size, r.seed);
        break;
      case 'tear':
        drawTears(ctx, ox, oy, size, r.seed);
        break;
    }
  }
}

// P3-1: §6.3 — "Unexplored" badge centered on the canvas when
// the viewing level has zero visited cells. Uses the existing
// i18n key `overlays.parchment.empty` (the legacy "Unexplored"
// placeholder for empty damage states). Renders as a single
// centered line plus a layer label so the player knows which
// level they're looking at. The translated strings are passed
// in by the component (we can't call `useT()` from a plain
// function — that would be a React-hook rule violation). The
// component reads them via `useT()` upstream and re-feeds the
// function on every render; a language switch flows through
// `useT()`'s subscription.
function drawUnexploredBadge(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  title: string,
  subtitle: string,
): void {
  // P3-1: pin the badge above the fog so the text stays
  // legible. The fog is at rgba(80,80,80,0.4) over a sepia
  // parchment — pure black would disappear into the fog,
  // so we draw a soft cream stroke first and then the dark
  // text on top.
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const fontSize = 22;
  ctx.save();
  ctx.font = `700 ${fontSize}px 'Georgia', 'SimSun', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Soft cream halo so the text reads on top of the fog.
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 240, 200, 0.85)';
  ctx.fillStyle = 'rgba(60, 30, 10, 0.95)';
  ctx.strokeText(title, cx, cy - fontSize);
  ctx.fillText(title, cx, cy - fontSize);
  // Subtitle: "L{n+1}" so the player knows which level
  // they're on. The same i18n key the tab bar uses, kept
  // 1-indexed for the human label.
  const subFont = 14;
  ctx.font = `500 ${subFont}px 'Georgia', 'SimSun', serif`;
  ctx.strokeText(subtitle, cx, cy + subFont);
  ctx.fillText(subtitle, cx, cy + subFont);
  ctx.restore();
}

function drawWaterStain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seed: number,
): void {
  // F-2026-06-30: P2-16 — radial gradient (dark sepia → transparent).
  // The seed biases the gradient's center so consecutive stains
  // don't look identical; the visual hint is "this region is hard
  // to read", not "this region is destroyed".
  const r = size / 2;
  const cx = x + r + (seed % 7) * 0.5;
  const cy = y + r + ((seed * 13) % 5) * 0.5;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(60, 30, 10, 0.55)');
  grad.addColorStop(0.7, 'rgba(80, 50, 20, 0.3)');
  grad.addColorStop(1, 'rgba(80, 50, 20, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawBurnHole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seed: number,
): void {
  // F-2026-06-30: P2-16 — burn renders as a dark, irregularly-edged
  // hole punched through the parchment. globalCompositeOperation =
  // 'destination-out' erases the underlying layers (already drawn
  // below), then we paint a charred-edge ring.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  const segments = 14;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const wobble = Math.sin(angle * 3 + seed) * 0.15;
    const radius = size / 2 + wobble * size * 0.1;
    const px = x + size / 2 + Math.cos(angle) * radius;
    const py = y + size / 2 + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Charred edge — blackened border, slightly larger than the hole.
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(20, 10, 0, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const radius = size / 2 + Math.sin(angle * 3 + seed) * 0.15 * size * 0.1;
    const px = x + size / 2 + Math.cos(angle) * radius;
    const py = y + size / 2 + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTears(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seed: number,
): void {
  // F-2026-06-30: P2-16 — multiple small slashes scattered across
  // the region. The seed offsets each tear so consecutive damage
  // events look distinct. Color is a slightly darker sepia so the
  // effect reads as "scuffed / hard to read" without erasing the
  // underlying map data (unlike burn).
  ctx.strokeStyle = 'rgba(30, 18, 8, 0.85)';
  ctx.lineWidth = 1.5;
  const tearCount = 5;
  for (let i = 0; i < tearCount; i++) {
    const angle = ((seed + i * 7) % 360) * (Math.PI / 180);
    const cx = x + size / 2 + ((((seed * (i + 1)) % 17) - 8) / 16) * size;
    const cy = y + size / 2 + ((((seed * (i + 3)) % 19) - 9) / 18) * size;
    const len = size * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle) * len, cy - Math.sin(angle) * len);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.stroke();
  }
}

// F-2026-06-30: P2-16 — top-level wrapper. Hides the modal entirely
// when the active level's minimapMode is not 'parchment', so a
// normal level never accidentally renders the parchment UI. The
// M-key handler in GameCanvas is the only thing that opens this.
export const ParchmentMap = memo(function ParchmentMap({
  maze,
}: ParchmentMapProps): React.ReactElement | null {
  const t = useT();
  const closeParchment = useGameStore((s) => s.closeParchment);

  // F-2026-06-30: P2-16 — handle ESC at the document level. The
  // event listener is attached only while the modal is conceptually
  // mounted, so ESC outside of an open modal does nothing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== CLOSE_MAP_KEY && e.key !== CLOSE_MAP_KEY) return;
      closeParchment();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeParchment]);

  // F-2026-06-30: P2-16 — auto-close when the tab loses focus. A
  // backgrounded modal is wasted CPU and a small visual annoyance
  // when the player returns; the spec also lists this as a
  // documented behavior.
  useEffect(() => {
    const handler = () => {
      if (document.hidden) closeParchment();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [closeParchment]);

  // F-2026-06-30: P2-16 — outside-mode guard. The GameCanvas
  // always mounts this component so the M key can open it
  // pre-emptively; this guard makes the actual modal bail before
  // rendering any chrome.
  if (maze.rules.minimapMode !== 'parchment') return null;

  // F-2026-06-30: P2-16 — accessibility: when the modal is open,
  // tell assistive tech that the underlying game is hidden.
  // `inert` would be cleaner but isn't typed in React 18; the
  // `aria-hidden` + `inert={true}` pair (where supported) covers
  // both browser generations.
  return (
    <>
      {useGameStore.getState().parchment.isOpen ? (
        <InertWrapper>
          <ParchmentMapImpl maze={maze} />
        </InertWrapper>
      ) : null}
      {/* F-2026-06-30: P2-16 — `aria-live` hint for the close key.
          Screen readers see the M / ESC prompt on first mount and
          don't re-read on every re-render (live='polite' is one-shot). */}
      <span className={styles.srOnly} aria-live="polite">
        {t('overlays.parchment.hint')} ({OPEN_MAP_KEY} / {CLOSE_MAP_KEY})
      </span>
    </>
  );
});

// F-2026-06-30: P2-16 — minimal inert wrapper. We don't use a full
// <dialog> element because the existing overlays (Pause / Win /
// GameOver) use the same fixed-backdrop pattern; staying consistent
// keeps the visual language intact. `inert` is the modern way to
// hide the rest of the page from focus + AT, with a `tabIndex=-1`
// fallback for browsers that don't support it.
function InertWrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const setInert = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    // F-2026-06-30: P2-16 — set inert as a boolean attribute, not
    // a string. React 18.3's type definitions for HTMLDivElement
    // do not include `inert` (it's a new HTML attribute), so we
    // narrow via an inline intersection with the optional field
    // rather than the previous `unknown as` double-cast.
    (el as HTMLDivElement & { inert?: boolean }).inert = true;
  }, []);
  return (
    <div ref={(node) => {
      ref.current = node;
      setInert(node);
    }}>
      {children}
    </div>
  );
}
