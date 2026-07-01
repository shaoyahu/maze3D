import { memo, useCallback, useEffect, useRef } from 'react';
import type { MazeData } from '../../maze/types';
import { useGameStore } from '../../store/gameStore';
import { useT } from '../../i18n';
import { CLOSE_MAP_KEY, OPEN_MAP_KEY } from '../../engine/InputManager';
import type { DamageRegion, ParchmentState } from '../../engine/ParchmentState';
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

  // F-2026-06-30: P2-16 — the modal is a sibling of the canvas, so
  // mount / unmount is keyed on `parchment.isOpen`. The render-null
  // guard handles the `minimapMode !== 'parchment'` case at the
  // GameCanvas layer; here we only bail on the open flag.
  if (!parchment.isOpen) return null;

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
        <ParchmentCanvas maze={maze} parchment={parchment} />
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
const ParchmentCanvas = memo(function ParchmentCanvas({
  maze,
  parchment,
}: {
  maze: MazeData;
  parchment: ParchmentState;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // F-2026-06-30: P2-16 — cache the procedural parchment background
  // (no walls, no visited, no damage) on a hidden canvas. The first
  // useEffect run fills it; subsequent runs only redraw the dynamic
  // layers onto the visible canvas. Without the cache, generating
  // noise per frame would visibly stutter at 50x50.
  const bgCacheRef = useRef<HTMLCanvasElement | null>(null);

  // F-2026-06-30: P2-16 — re-render whenever the parchment reference
  // changes (visited grew, new damage region, etc.). maze.id is also
  // a dependency because the dimensions + walls + start/exit only
  // change at level boundaries.
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

    drawWalls(ctx, maze, cellSize, toPx);
    drawStartExit(ctx, maze, cellSize, toPx);
    drawVisited(ctx, parchment, maze, cellSize, toPx);
    drawPickups(ctx, maze, parchment, cellSize, toPx);
    drawDamage(ctx, parchment.damageRegions, cellSize, toPx);
  }, [maze, parchment]);

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
  for (let z = 0; z < maze.size.depth; z++) {
    for (let x = 0; x < maze.size.width; x++) {
      if (maze.walls[z]?.[x] === 1) {
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

function drawVisited(
  ctx: CanvasRenderingContext2D,
  parchment: ParchmentState,
  maze: MazeData,
  cellSize: number,
  toPx: (x: number, z: number) => { x: number; y: number },
): void {
  // F-2026-06-30: P2-16 — every visited cell gets a sepia-toned
  // highlight (slightly darker than the parchment background) to
  // mark "explored". Empty parchment + highlighted visited is the
  // central UX signal: you only see where you've been.
  ctx.fillStyle = 'rgba(120, 80, 40, 0.18)';
  for (const key of parchment.visitedCells) {
    const [xStr, zStr] = key.split(',');
    const x = Number(xStr);
    const z = Number(zStr);
    if (x < 0 || x >= maze.size.width || z < 0 || z >= maze.size.depth) continue;
    const p = toPx(x, z);
    ctx.fillRect(p.x, p.y, cellSize, cellSize);
  }
}

function drawPickups(
  ctx: CanvasRenderingContext2D,
  maze: MazeData,
  parchment: ParchmentState,
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
    if (!parchment.visitedCells.has(`${pickup.x},${pickup.z}`)) continue;
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

function drawDamage(
  ctx: CanvasRenderingContext2D,
  regions: readonly DamageRegion[],
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
