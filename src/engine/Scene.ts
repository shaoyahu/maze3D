import * as THREE from 'three';
import type { CellType, KeyColor, MazeData, VerticalTransition } from '../maze/types';
import { createPickupMaterial } from '../entities/Pickup';
import { ENEMY_HEIGHT, ENEMY_RADIUS } from '../entities/Enemy';
// P3-1: the engine needs the per-layer wall grids to render N
// stacked floors / ceilings / walls. `MazeData.walls` only holds
// layer 0 (spec §4.1), so we reach into the provider's cache —
// the cache is populated by `AlgorithmMazeProvider.load` and
// keyed by `maze.id`. For non-procedural levels (hand-crafted
// JSON) the cache miss collapses to `[maze.walls]`, which is
// exactly the single-layer back-compat path.
import { getPerLayerWallsByLevelId } from '../maze/AlgorithmMazeProvider';

// F-2026-06-17-B-H-1: track GPU resources with strong Set<> refs, NOT
// WeakSet<>. Three.js textures / geometries / materials are GPU-backed;
// they MUST be explicitly dispose()'d before being dropped, even if the
// JS-side wrapper is GC'd (the GPU upload survives). A WeakSet silently
// loses entries once the wrapper is collected, defeating the purpose of
// "have I already disposed this?". With strong Sets we keep the wrappers
// alive until the module itself is torn down — which is the desired
// lifetime for a singleton dedupe set anyway.
//
// F-D-17 (P3-Theme 6): cross-call double-dispose tracking for textures.
// The per-call `seenTexs` inside disposeScene only dedupes within a single
// invocation; if the same THREE.Texture is fed to a second disposeScene()
// (e.g. React strict-mode double-mount, level-swap race, or hot-reload),
// CanvasTexture.dispose() can throw or warn. We log once per texture and
// skip the second call. Both sets are strong so disposed textures can be
// tracked across disposeScene() calls even after the wrapping scene is
// GC'd.
const disposedTexs = new Set<THREE.Texture>();
const doubleDisposeWarned = new Set<THREE.Texture>();

function createWallTexture(): THREE.CanvasTexture {
  // Brick pattern with visible horizontal & vertical mortar lines so the
  // user can see whether the camera is rolled (lines stay level) and
  // whether the perspective is correct (lines converge to the horizon).
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#b2a06b';
    ctx.fillRect(0, 0, size, size);
    const brickW = 64;
    const brickH = 32;
    const mortarW = 3;
    ctx.fillStyle = '#3a2a0a';
    for (let y = 0; y <= size; y += brickH) {
      ctx.fillRect(0, y - Math.floor(mortarW / 2), size, mortarW);
    }
    for (let y = 0; y < size; y += brickH) {
      const offset = (y / brickH) % 2 === 0 ? 0 : brickW / 2;
      for (let x = offset; x <= size; x += brickW) {
        ctx.fillRect(x - Math.floor(mortarW / 2), y, mortarW, brickH);
      }
    }
  }
  return new THREE.CanvasTexture(canvas);
}

function createFloorTexture(): THREE.CanvasTexture {
  // Grid with a center cross — the user can watch floor tiles slide
  // straight back when pressing W, and see exactly when they drift.
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#6e6e80';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#3a3a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 4);
    ctx.lineTo(size / 2, (3 * size) / 4);
    ctx.moveTo(size / 4, size / 2);
    ctx.lineTo((3 * size) / 4, size / 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Textures are recreated per buildScene. The earlier "hoist to module scope"
// optimization was misleading — disposeScene disposes every material's .map,
// which includes hoisted textures, so the GPU still re-uploads on every level
// transition. Creating them here keeps the dispose path simple and the comment
// honest. Canvas paint is a few ms — cheap enough to repeat.

function createCloudTexture(): THREE.CanvasTexture {
  // Sky-blue background with a handful of soft white cloud blobs. Repeat
  // wraps so the ceiling reads as continuous sky, not a single tile.
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, size, size);
    // Large puffs.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    for (let i = 0; i < 6; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const cr = 22 + Math.random() * 28;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Small wisps that break up the silhouettes of the large ones.
    for (let i = 0; i < 10; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const cr = 8 + Math.random() * 14;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface SceneRefs {
  scene: THREE.Scene;
  walls: THREE.Mesh[];
  exit: THREE.Mesh;
  pickups: THREE.Mesh[];
  enemies: THREE.Mesh[];
  // P2-18: trap meshes indexed by position key "x,z". Used by the engine
  // for rendering only (collision is cell-based, not mesh-based).
  traps: THREE.Mesh[];
  // P2-18: door meshes keyed by door id. The engine calls
  // doors.get(id) to hide the mesh on openDoor().
  doors: Map<string, THREE.Mesh>;
  playerMarker: THREE.Mesh;
  // P3-1: meshes for the vertical transitions (stairs / holes /
  // ladders). One mesh per `MazeData.transitions` entry, anchored
  // on the source layer's cell center. The engine doesn't
  // currently animate or interact with these — the workstream-2
  // Game tick reads `maze.transitions` to drive collision + the
  // `applyVerticalTransition` tween — but exposing them in
  // SceneRefs keeps the dispose path uniform (walk the scene
  // graph and call `dispose` on every mesh, regardless of which
  // SceneRefs array it came from).
  transitions: THREE.Mesh[];
  // P3-2: per-hole-down warning ring meshes, parallel to `transitions`
  // (one ring per `hole-down` entry, hidden by default). The engine
  // calls `setWarningFlashState(t)` with the active `hole-down`
  // transition during the 0.5s warning phase; the matching ring
  // becomes visible (and pulses) for that window. After the warning
  // completes, the engine calls `setWarningFlashState(null)` and
  // the ring goes back to hidden. The closure is the same pattern
  // as `setDarkMode` — encapsulates the per-mesh walk so the engine
  // doesn't have to know which mesh indexes which transition.
  warningRings: THREE.Mesh[];
  setWarningFlashState: (transition: VerticalTransition | null) => void;
  setDarkMode: (enabled: boolean) => void;
}

// P3-1: shared y-axis math constants. The single source of truth
// for "where does each layer sit in world space". Engine + player
// + future editor UI all import from Player.ts to read these
// values (the same constants live there for the engine side), so
// a future tweak to the layer height only needs to land in one
// place. Re-declared here for the engine's own readability — the
// values MUST stay in lockstep with `Player.FLOOR_HEIGHT`.
const FLOOR_HEIGHT = 2.4;
const WALL_HEIGHT = FLOOR_HEIGHT; // 2.4m tall walls per layer
const WALL_CENTER_Y = WALL_HEIGHT / 2; // 1.2m — wall mesh center y above the layer's floor

// Resolve the per-layer wall grids for the engine. The provider
// caches the grids from `generateMultiLevel`; for a cache miss
// (hand-crafted JSON level, or the first frame of a non-
// procedural level) we collapse to `[maze.walls]` so the single-
// layer rendering path stays exact.
//
// The function is the single point where the engine meets the
// multi-layer data side-channel; the rest of `buildScene` treats
// `perLayerWalls` as an opaque `CellType[][][]` of length
// `levelCount`.
function resolvePerLayerWalls(maze: MazeData): CellType[][][] {
  const levelCount = maze.levelCount ?? 1;
  const cached = getPerLayerWallsByLevelId(maze.id);
  if (cached && cached.length === levelCount) {
    return cached;
  }
  // Cache miss / length mismatch: fall back to single-layer. This
  // is the back-compat path for hand-crafted levels (which never
  // hit the provider's cache) and for any caller that builds a
  // SceneRefs without going through `AlgorithmMazeProvider.load`.
  return [maze.walls];
}

export function buildScene(maze: MazeData, darkMode =false): SceneRefs {
  // P4: dispatch to the 3D voxel renderer when the maze carries a
  // `walls3D` grid. The 2D path below assumes a stack-of-layers shape
  // (per-layer walls / floor / ceiling / per-cell pickup placement),
  // which doesn't apply to a 3D cube — there's no notion of "layer 0
  // floor" because every (x, y, z) cell is its own cube. The 3D
  // builder is a sibling function (buildScene3D) that fills the same
  // SceneRefs shape with cuboid-per-wall-cell rendering and no floor
  // / ceiling. Both branches return identical SceneRefs types so the
  // engine can treat the result uniformly.
  if (maze.walls3D !== undefined) {
    return buildScene3D(maze, darkMode);
  }
  const scene = new THREE.Scene();

  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);
  const dir = new THREE.DirectionalLight();
  dir.position.set(5, 10, 5);
  scene.add(dir);

  // P2-2 dark mode: two palettes toggled by setDarkMode. Caller passes the
  // bool; engine stays store-free per Q3 / DoD §14.2.
  const LIGHT_PALETTE = {
    bg: 0x87ceeb, hemiSky: 0xddeeff, hemiGround: 0xc8b896,
    hemiIntensity: 0.8, dirColor: 0xffffff, dirIntensity: 0.7,
  };
  // P2-2 F12: fog color is no longer a separate field — it must track bg,
  // otherwise the horizon fog band reads as a different color than the sky
  // (the value 0x0a0a14 was previously duplicated in both fields and the
  // duplication was load-bearing rather than explicit). Callers read it via
  // DARK_PALETTE.bg at the call sites below.
  const DARK_PALETTE = {
    bg: 0x0a0a14, hemiSky: 0x4466aa, hemiGround: 0x1a1a22,
    hemiIntensity: 0.4, dirColor: 0xb0c4ff, dirIntensity: 0.5,
    fogDensity: 0.05,
  };
  const applyPalette = (
    p: typeof LIGHT_PALETTE,
    fog: THREE.FogExp2 | null,
  ) => {
    scene.background = new THREE.Color(p.bg);
    hemi.color.setHex(p.hemiSky);
    hemi.groundColor.setHex(p.hemiGround);
    hemi.intensity = p.hemiIntensity;
    dir.color.setHex(p.dirColor);
    dir.intensity = p.dirIntensity;
    scene.fog = fog;
  };
  // F8: single source of truth for "is dark mode on?". setDarkMode(enabled)
  // is now a one-liner that calls this helper with the LIVE argument, so
  // toggling off after a dark-mode build actually reverts to LIGHT. The
  // prior implementation branched on the closure-captured `darkMode`
  // (buildScene's parameter) and re-applied DARK in that case.
  // The initial paint also routes through here, so the build-time darkMode
  // flag takes effect on frame 0 — no extra `setDarkMode(...)` call needed
  // from the caller (Game.startLevel previously did call it, but that was
  // only to mask the unconditional LIGHT apply on line 152).
  const applyDarkMode = (enabled: boolean) => {
    if (enabled) {
      applyPalette(
        DARK_PALETTE,
        new THREE.FogExp2(DARK_PALETTE.bg, DARK_PALETTE.fogDensity),
      );
    } else {
      applyPalette(LIGHT_PALETTE, null);
    }
  };
  applyDarkMode(darkMode);

  function setDarkMode(enabled: boolean) {
    applyDarkMode(enabled);
  }

  const cs = maze.cellSize;
  const w = maze.size.width;
  const d = maze.size.depth;

  // P3-1: figure out how many layers this level has. Single-layer
  // (levelCount=1) is the P2-era back-compat path — same meshes,
  // same positions, same mesh count, same dispose signature. The
  // multi-layer path adds per-layer floors / ceilings / walls and a
  // transitions array.
  const levelCount = maze.levelCount ?? 1;
  const perLayerWalls = resolvePerLayerWalls(maze);

  const floorTex = createFloorTexture();
  floorTex.repeat.set(w, d);
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });

  const wallTex = createWallTexture();
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });

  // P3-1: hoist the ceiling texture + material outside the layer
  // loop. The single-layer path used them once; the multi-layer
  // path can reuse the same material across all layers (the
  // texture is tiled w×d and never per-layer anyway). Without
  // the hoist, a 6-layer level would create 6 cloud textures —
  // a slow leak that compounds over level transitions.
  const ceilingTex = createCloudTexture();
  ceilingTex.repeat.set(w, d);
  const ceilingMat = new THREE.MeshBasicMaterial({ map: ceilingTex });

  const exitMat = new THREE.MeshLambertMaterial({ color: 0x5cff5c, emissive: 0x115511 });

  // P3-1: hoisted geometries / materials that are reused across all
  // layers. The single-layer path uses them once (same as before);
  // the multi-layer path reuses them `levelCount` times, so the
  // GPU sees `levelCount` meshes that all share one geometry +
  // material — no extra allocation per layer.
  const floorGeom = new THREE.PlaneGeometry(w * cs, d * cs);
  const wallGeom = new THREE.BoxGeometry(cs, WALL_HEIGHT, cs);

  // CELL-CENTER ALIGNMENT (critical — do not "simplify" away the + cs/2).
  // Collision.collidesAt and Rules.cellOf both treat cell (cx, cz) as the
  // world AABB [cx*cs, (cx+1)*cs) × [cz*cs, (cz+1)*cs). The player position
  // (and the player marker) live at the cell CENTER ((cx+0.5)*cs, _, ...).
  // Wall / exit / pickup meshes must be placed at the same cell center, or
  // the 3D world ends up offset by cs/2 from the collision world: the user
  // sees an open corridor while the engine reports a wall dead ahead, and
  // walking forward stops "in the middle of nothing". Three.js BoxGeometry
  // is centered on its position, so positioning at ((x+0.5)*cs, _, (z+0.5)*cs)
  // makes the box occupy exactly [x*cs, (x+1)*cs] × [z*cs, (z+1)*cs] — the
  // same AABB the collision system uses.
  //
  // P3-1: this rule is unchanged for multi-layer. Every wall / floor /
  // exit / etc. on layer L is positioned at y = L * FLOOR_HEIGHT plus its
  // pre-P3-1 base y, so the cell-center invariant in x/z keeps holding
  // (collision in workstream 2 reads the same coords regardless of layer).
  const walls: THREE.Mesh[] = [];
  for (let L = 0; L < levelCount; L++) {
    const layerWalls = perLayerWalls[L];
    const layerY = L * FLOOR_HEIGHT;

    // Floor — a single plane at this layer's height. The texture +
    // geometry are shared across layers (no per-layer allocation),
    // only the position changes.
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((w * cs) / 2, layerY, (d * cs) / 2);
    scene.add(floor);

    // Ceiling — the sky. Same plane geometry as the floor (rotated
    // the other way) so layer L's ceiling and layer (L+1)'s floor
    // share the same y = (L+1) * FLOOR_HEIGHT. The cloud texture +
    // MeshBasicMaterial keep it bright regardless of the directional
    // light angle. Without this the player would see a flat dark
    // plane when looking up.
    const ceiling = new THREE.Mesh(floorGeom, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((w * cs) / 2, layerY + FLOOR_HEIGHT, (d * cs) / 2);
    scene.add(ceiling);

    // Interior walls for this layer.
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (layerWalls[z][x] === 1) {
          const m = new THREE.Mesh(wallGeom, wallMat);
          m.position.set((x + 0.5) * cs, layerY + WALL_CENTER_Y, (z + 0.5) * cs);
          scene.add(m);
          walls.push(m);
        }
      }
    }

    // PERIMETER (visual-only). Collision.collidesAt already treats x<0, x>=w,
    // z<0, z>=d as wall — but without a mesh there, a player blocked by the
    // map edge sees nothing in front and the on-floor marker (which represents
    // their collision volume) appears to float in mid-corridor. We add a
    // ring of wall meshes one cell outside the grid (including the four
    // corners) for every layer — the player's view from layer L is
    // independent of the others (pure A per spec §3 decision 2), so each
    // layer needs its own perimeter ring.
    //
    // The shared wall geometry + material keep the GPU cost of duplicating
    // the ring per layer modest: 4 perimeter corners + 2*(w+2) + 2*d
    // wall meshes per layer, all using the same two GPU buffers.
    for (let x = -1; x <= w; x++) {
      for (const z of [-1, d]) {
        const m = new THREE.Mesh(wallGeom, wallMat);
        m.position.set((x + 0.5) * cs, layerY + WALL_CENTER_Y, (z + 0.5) * cs);
        scene.add(m);
        walls.push(m);
      }
    }
    for (let z = 0; z < d; z++) {
      for (const x of [-1, w]) {
        const m = new THREE.Mesh(wallGeom, wallMat);
        m.position.set((x + 0.5) * cs, layerY + WALL_CENTER_Y, (z + 0.5) * cs);
        scene.add(m);
        walls.push(m);
      }
    }
  }

  // P3-1: the exit is now a per-entity-on-its-layer placement.
  // Only the level matching `maze.exit.level` (default 0) shows
  // the visible exit pad; the engine's `crossesExit` rule (in
  // workstream 2's Collision / Rules surface) reads the same
  // field to gate the win. The y is shifted by `exit.level *
  // FLOOR_HEIGHT` so the pad sits flush with the layer's floor
  // (a 0.05m lift above the floor is the historical
  // "exit-pad-glow" effect).
  const exitLevel = maze.exit.level ?? 0;
  const exitGeom = new THREE.BoxGeometry(cs * 0.6, 0.1, cs * 0.6);
  const exit = new THREE.Mesh(exitGeom, exitMat);
  exit.position.set(
    (maze.exit.x + 0.5) * cs,
    exitLevel * FLOOR_HEIGHT + 0.05,
    (maze.exit.z + 0.5) * cs,
  );
  scene.add(exit);

  // Player position indicator: a flat green ring on the floor, slightly
  // larger than the player's collision radius (0.2) so the user can see
  // where they are. Position is updated each frame in Game.update.
  // P3-1: the marker follows the start cell's layer (default 0) so
  // a multi-level spawn lands on the right floor.
  const startLevel = maze.start.level ?? 0;
  const playerMarkerGeom = new THREE.RingGeometry(0.22, 0.26, 32);
  const playerMarkerMat = new THREE.MeshBasicMaterial({
    color: 0x4dff88,
    side: THREE.DoubleSide,
  });
  const playerMarker = new THREE.Mesh(playerMarkerGeom, playerMarkerMat);
  playerMarker.rotation.x = -Math.PI / 2;
  playerMarker.position.set(
    maze.start.x * cs + cs / 2,
    startLevel * FLOOR_HEIGHT + 0.02,
    maze.start.z * cs + cs / 2,
  );
  scene.add(playerMarker);

  const pickups: THREE.Mesh[] = [];
  const pickupGeom = new THREE.OctahedronGeometry(0.25);
  for (const p of maze.pickups) {
    const pickupMat = createPickupMaterial(p.type);
    const pLevel = p.level ?? 0;
    const lower = new THREE.Mesh(pickupGeom, pickupMat);
    lower.position.set((p.x + 0.5) * cs, pLevel * FLOOR_HEIGHT + 0.35, (p.z + 0.5) * cs);
    lower.userData = { pickup: p, siblings: [] as THREE.Mesh[] };
    scene.add(lower);
    pickups.push(lower);

    const upper = new THREE.Mesh(pickupGeom, pickupMat);
    upper.position.set((p.x + 0.5) * cs, pLevel * FLOOR_HEIGHT + 0.75, (p.z + 0.5) * cs);
    upper.userData = { pickup: p, siblings: [lower] };
    lower.userData.siblings = [upper];
    scene.add(upper);
    pickups.push(upper);
  }

  // P2-4a: one capsule mesh per enemy. Total height 1.6m = 2*radius + length.
  // Shared geometry + material across enemies (saves GPU memory and matches
  // the wall/pickup pattern) — disposeScene still releases the single
  // instance exactly once because the disposeMat/seenGeoms set dedupes.
  // ENEMY_RADIUS/ENEMY_HEIGHT are imported from entities/Enemy so the
  // hitbox and the visible mesh can't drift (review F11).
  // P3-1: each enemy sits on its own layer; `e.level ?? 0` is the
  // historical single-layer default so pre-P3-1 levels keep working.
  const enemies: THREE.Mesh[] = [];
  const enemyGeom = new THREE.CapsuleGeometry(ENEMY_RADIUS, ENEMY_HEIGHT - 2 * ENEMY_RADIUS);
  const enemyMat = new THREE.MeshLambertMaterial({ color: 0x553333 });
  for (const e of maze.enemies) {
    const mesh = new THREE.Mesh(enemyGeom, enemyMat);
    // Spawn at cell center, y = ENEMY_HEIGHT/2 above the layer's floor.
    const eLevel = e.level ?? 0;
    mesh.position.set(
      (e.x + 0.5) * cs,
      eLevel * FLOOR_HEIGHT + ENEMY_HEIGHT / 2,
      (e.z + 0.5) * cs,
    );
    mesh.userData = { enemy: e };
    scene.add(mesh);
    enemies.push(mesh);
  }

  // P2-18: trap meshes. Fire traps are warm-orange flat planes with a
  // subtle flicker; water traps are blue discs with a ripple look.
  // F-2026-07-01-FCR-M-3: hoisted geometries outside the loop (like wallGeom,
  // pickupGeom, etc.) so they are shared across all trap meshes instead
  // of creating one geometry per trap.
  // P3-1: per-layer y offset so a trap on layer L sits 0.03m above
  // the L-th floor.
  const traps: THREE.Mesh[] = [];
  const fireTrapMat = new THREE.MeshLambertMaterial({
    color: 0xff6622,
    emissive: 0x331100,
    transparent: true,
    opacity: 0.7,
  });
  const waterTrapMat = new THREE.MeshLambertMaterial({
    color: 0x2288ff,
    emissive: 0x001133,
    transparent: true,
    opacity: 0.6,
  });
  const fireTrapGeom = new THREE.PlaneGeometry(cs * 0.8, cs * 0.8);
  const waterTrapGeom = new THREE.CircleGeometry(cs * 0.35, 24);
  for (const t of maze.traps) {
    const mat = t.kind === 'fire' ? fireTrapMat : waterTrapMat;
    const geom = t.kind === 'fire' ? fireTrapGeom : waterTrapGeom;
    const mesh = new THREE.Mesh(geom, mat);
    const tLevel = t.level ?? 0;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((t.x + 0.5) * cs, tLevel * FLOOR_HEIGHT + 0.03, (t.z + 0.5) * cs);
    mesh.userData = { trap: t };
    scene.add(mesh);
    traps.push(mesh);
  }

  // P2-18: door meshes. Closed doors are metal-gray boxes filling the
  // cell (treated as walls by collision). When opened, mesh.visible is
  // set to false. Each door gets its own material so we can tint by
  // keyColor for visual clarity.
  // P3-1: per-layer y offset — a door on layer L sits at the L-th
  // floor's mid-height (1.2m above the floor, like a wall).
  const doors = new Map<string, THREE.Mesh>();
  const doorGeom = new THREE.BoxGeometry(cs, WALL_HEIGHT, cs);
  // P2-18: key color → door tint mapping.
  // F-2026-07-01-FCR-M-7: type the map as Record<KeyColor, number> so
  // TypeScript verifies all four colors are present at compile time.
  // Previously `Record<string, number>` allowed a fifth color to
  // silently fall through to the 0x555555 gray fallback.
  const DOOR_COLOR: Record<KeyColor, number> = {
    red: 0x882222,
    blue: 0x222288,
    green: 0x228822,
    yellow: 0x888822,
  };
  for (const d of maze.doors) {
    const color = DOOR_COLOR[d.keyColor];
    const doorMat = new THREE.MeshLambertMaterial({
      color,
      emissive: color & 0x222222,
    });
    const mesh = new THREE.Mesh(doorGeom, doorMat);
    const dLevel = d.level ?? 0;
    mesh.position.set((d.x + 0.5) * cs, dLevel * FLOOR_HEIGHT + WALL_CENTER_Y, (d.z + 0.5) * cs);
    mesh.userData = { door: d };
    scene.add(mesh);
    doors.set(d.id, mesh);
  }

  // P3-1: vertical-transition meshes. Each `VerticalTransition` in
  // `maze.transitions` produces one mesh anchored on the source
  // layer's cell center. Only `stair-up` and `hole-down` get a mesh
  // in P3-1b (the other kinds are data-layer-valid but the engine
  // doesn't render / animate them yet — see spec §3 decision 1).
  //
  // Visual choices are deliberately minimal for the MVP:
  //   - stair-up: a tilted box at the source cell, brown, large
  //     enough to read as "stairs going up". The exact slope
  //     matches `atan(FLOOR_HEIGHT / cs)` so it touches both floors.
  //   - hole-down: a dark square on the source cell's floor,
  //     indicating "drop down here". The pure-A spec (Q2) forbids
  //     a see-through opening, so the hole is a visual cue only.
  //   - other kinds: TODO. The mesh is still added to the scene
  //     graph (as a no-op placeholder) so the dispose path walks
  //     the same shape regardless of kind. P3-1c can replace the
  //     placeholder meshes with the proper visuals.
  const transitions: THREE.Mesh[] = [];
  const transitionsList: VerticalTransition[] = maze.transitions ?? [];
  for (const t of transitionsList) {
    const tcs = t.level * FLOOR_HEIGHT;
    const cellCenterX = (t.x + 0.5) * cs;
    const cellCenterZ = (t.z + 0.5) * cs;
    const mesh = createTransitionMesh(t.kind, cs, FLOOR_HEIGHT);
    if (mesh === null) {
      // P3-1c+ scope; we still need *something* in the array so
      // the `transitions.length === maze.transitions.length`
      // invariant downstream consumers expect holds. Insert a
      // hidden empty mesh (geometry-less) at the cell center.
      // This is a development-only fallback; the P3-1c editor
      // will replace the no-op with the real visual.
      const placeholder = new THREE.Object3D() as unknown as THREE.Mesh;
      placeholder.position.set(cellCenterX, tcs, cellCenterZ);
      placeholder.visible = false;
      scene.add(placeholder);
      transitions.push(placeholder);
      continue;
    }
    mesh.position.set(cellCenterX, tcs, cellCenterZ);
    mesh.userData = { transition: t };
    scene.add(mesh);
    transitions.push(mesh);
  }

  // P3-2: warning rings. One per `hole-down` transition, hidden by
  // default. The geometry is a thin torus lying flat on the floor
  // so the player sees a red halo around the dark hole-down square
  // during the 0.5s warning phase. The `userData.transition` lookup
  // is the inverse of the `setWarningFlashState` match, so the
  // engine can call `setWarningFlashState(t)` with the full
  // `VerticalTransition` and the closure finds the right ring.
  // Sharing the same `userData.transition` key with the main
  // `transitions[i]` mesh means a future refactor that consolidates
  // the two arrays can do so without changing the call shape.
  const warningRings: THREE.Mesh[] = [];
  for (const t of transitionsList) {
    if (t.kind !== 'hole-down') continue;
    const tcs = t.level * FLOOR_HEIGHT;
    const cellCenterX = (t.x + 0.5) * cs;
    const cellCenterZ = (t.z + 0.5) * cs;
    const ringGeom = new THREE.TorusGeometry(cs * 0.4, cs * 0.05, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff2222,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2; // lie flat on the floor
    // P3-2 (code-review fix): the dark `hole-down` square sits at
    // y = 0.02 (just above the floor). The warning ring previously
    // sat at y = 0.03 — only 0.01 above the square, well inside the
    // depth-buffer precision floor on most GPUs and guaranteed to
    // z-fight when the camera looked down at a low angle. The 0.06
    // offset gives ~3x the previous safety margin and still keeps
    // the ring visually attached to the source cell.
    ring.position.set(cellCenterX, tcs + 0.06, cellCenterZ);
    ring.visible = false;
    ring.userData = { transition: t, isWarningRing: true };
    scene.add(ring);
    warningRings.push(ring);
  }

  // P3-2: closure that turns the matching ring on / off. The
  // matching key is `transition.id` because every `VerticalTransition`
  // has a unique id (the seed codec uses it as the primary key too,
  // so the same id reaches the runtime through the round-trip).
  // When the engine calls this with `null`, all rings go hidden —
  // the typical sequence is `setWarningFlashState(t)` on warning
  // start, `setWarningFlashState(null)` on warning complete (or on
  // level reset). The `setVisible(true)` branch also nudges the
  // material opacity toward 1; the per-frame pulse is owned by
  // the engine's tick (we don't drive it here because the engine
  // is the only thing that knows the elapsed time).
  const setWarningFlashState = (active: VerticalTransition | null): void => {
    for (const ring of warningRings) {
      const matches = active !== null && ring.userData.transition.id === active.id;
      ring.visible = matches;
      if (matches) {
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.9;
      }
    }
  };

  return {
    scene,
    walls,
    exit,
    pickups,
    enemies,
    traps,
    doors,
    playerMarker,
    transitions,
    warningRings,
    setWarningFlashState,
    setDarkMode,
  };
}

// P3-1: per-kind transition mesh builder. Returns `null` for the
// "rendering deferred to a later increment" kinds so the caller
// can insert a hidden placeholder. The two MVP kinds (stair-up
// and hole-down) get a clear, cell-sized visual; the geometry /
// material are per-call because each transition wants its own
// world transform (and sharing the same geometry across all
// transitions of the same kind is fine for dispose, but the
// material is per-call so future per-transition tinting can
// happen without a refactor).
function createTransitionMesh(
  kind: VerticalTransition['kind'],
  cs: number,
  floorHeight: number,
): THREE.Mesh | null {
  switch (kind) {
    case 'stair-up': {
      // Tilted box: a `cs × floorHeight × cs` slab rotated by the
      // slope angle around the z-axis so it bridges the source
      // floor (at y = 0 in local space) to the destination floor
      // (at y = floorHeight in local space). The rotation is the
      // visual "this goes up" cue; collision / animation is the
      // workstream-2 Game tick's job.
      const geom = new THREE.BoxGeometry(cs * 0.9, floorHeight, cs * 0.9);
      const mat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
      const mesh = new THREE.Mesh(geom, mat);
      const slope = Math.atan2(floorHeight, cs);
      mesh.rotation.z = -slope;
      // Re-center so the rotated box's "down" end touches y = 0
      // and its "up" end touches y = floorHeight in local space.
      // Without this offset the box's center stays at y = floorHeight
      // / 2, which after the rotation leaves the lower end at
      // y = floorHeight / 2 - sin(slope) * floorHeight / 2 and the
      // higher end at y = floorHeight / 2 + sin(slope) * floorHeight
      // / 2 — the slopes never reach the floors.
      mesh.position.y = floorHeight / 2;
      return mesh;
    }
    case 'hole-down': {
      // Dark square on the source cell's floor. The spec's pure-A
      // rule (Q2) means we don't punch a hole through to the
      // destination layer — the player sees a visual cue ("hole
      // here") and trusts the workstream-2 collision code to drop
      // them on the destination layer when they step on it.
      const geom = new THREE.PlaneGeometry(cs * 0.7, cs * 0.7);
      const mat = new THREE.MeshLambertMaterial({ color: 0x111111 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02; // just above the floor
      return mesh;
    }
    // P3-1c+ scope. Returning null here makes the caller insert a
    // hidden placeholder so the transitions array length matches
    // the source data shape.
    case 'stair-down':
    case 'hole-up':
    case 'ladder':
      return null;
  }
}

export function disposeScene(
  scene: THREE.Scene,
  walls: THREE.Mesh[],
  pickups: THREE.Mesh[],
  enemies: THREE.Mesh[] = [],
  traps: THREE.Mesh[] = [],
  // F-2026-07-01-FCR-M-2: added doors Map parameter so we can clear stale
  // references after disposal. Without this, the Map still held references
  // to disposed meshes after a level transition.
  doors?: Map<string, THREE.Mesh>,
  // P3-1: transition meshes. Cleared in lockstep with the other
  // per-build arrays so a level-swap race doesn't leave the new
  // SceneRefs with stale refs into the previous level's disposed
  // meshes. The scene-traversal-based dispose above already walks
  // every mesh in the graph (transitions included) — the explicit
  // `.length = 0` is for the reference array, not the GPU
  // resources.
  transitions: THREE.Mesh[] = [],
  // P3-2: warning ring meshes, one per `hole-down` transition.
  // Same dispose-in-lockstep contract as `transitions` — the
  // scene-graph walk above already releases the GPU resources
  // (geometry + material), the explicit `.length = 0` below
  // clears the JS-side reference array so a level swap doesn't
  // leak stale THREE.Mesh handles into the next SceneRefs.
  warningRings: THREE.Mesh[] = [],
) {
  // F-2026-06-17-B-H-1: Set (strong refs), not WeakSet. Three.js
  // BufferGeometry / Material / Texture must be dispose()'d explicitly;
  // using WeakSet would let the wrapper be GC'd while the GPU resource
  // leaks. The seen* sets are local to this invocation; on a second
  // disposeScene() call the module-level `disposedTexs` set (also strong)
  // dedupes across calls.
  const seenGeoms = new Set<THREE.BufferGeometry>();
  const seenMats = new Set<THREE.Material>();
  const seenTexs = new Set<THREE.Texture>();
  const disposeTex = (t: THREE.Texture | undefined | null) => {
    if (!t) return;
    if (seenTexs.has(t)) return;
    // F-D-17: cross-call double-dispose guard. `seenTexs` above only
    // dedupes within a single disposeScene() run; if the same texture
    // was already disposed by a previous call, log once and skip.
    if (disposedTexs.has(t)) {
      if (!doubleDisposeWarned.has(t)) {
        doubleDisposeWarned.add(t);
        // eslint-disable-next-line no-console -- diagnostics for double-dispose
        console.warn('[Scene] double-dispose detected on texture, skipping');
      }
      return;
    }
    seenTexs.add(t);
    disposedTexs.add(t);
    t.dispose();
  };
  const disposeMat = (m: THREE.Material) => {
    if (seenMats.has(m)) return;
    seenMats.add(m);
    const map = (m as THREE.Material & { map?: THREE.Texture | null }).map;
    disposeTex(map);
    m.dispose();
  };
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const g = obj.geometry;
      if (g && !seenGeoms.has(g)) { seenGeoms.add(g); g.dispose(); }
      const mat = obj.material;
      if (Array.isArray(mat)) for (const m of mat) disposeMat(m);
      else if (mat) disposeMat(mat);
    }
  });
  // F-2026-06-17-B-M-12: clear the scene's own children list after the
  // walk above removes their GPU resources. Without this, the parent→child
  // references stay in place: `scene.children` still holds the disposed
  // Object3D instances, the next buildScene() would still see them via
  // add() conflicts, and the Game's local refs to walls/pickups/enemies
  // arrays would still point at disposed meshes. The walk above mutated
  // those arrays in place (walls.length=0) but the scene graph itself
  // is its own structure.
  scene.clear();
  walls.length = 0;
  pickups.length = 0;
  enemies.length = 0;
  traps.length = 0;
  transitions.length = 0;
  // P3-2: clear the warningRings array in lockstep with the rest.
  // Without this, the per-build array inside the new SceneRefs
  // would still hold a reference to the disposed meshes until the
  // next buildScene() overwrites it — a subtle source of
  // "stale mesh in the next frame's render" bugs that the scene
  // walk above would mask (it walks the graph, not the array).
  warningRings.length = 0;
  // F-2026-07-01-FCR-M-2: clear the doors Map so stale mesh references
  // don't survive past a level transition.
  doors?.clear();
  // F-2026-06-17-B-L-3: clear the module-level disposedTexs /
  // doubleDisposeWarned Sets so a fresh level build doesn't double-warn
  // for textures that were already disposed in a previous level's teardown.
  // Without this, the Sets grew monotonically (one entry per texture
  // ever created) and JS heap ballooned by 1.5-6 MB per 100 levels.
  disposedTexs.clear();
  doubleDisposeWarned.clear();
}

// ---------------------------------------------------------------------------
// P4: 3D voxel maze scene builder.
// ---------------------------------------------------------------------------
//
// Sibling of `buildScene` for 3D cube mazes. The shape is the same
// (SceneRefs) so the engine treats the result uniformly, but the
// contents are very different:
//
//   - `walls` is a sparse array of `BoxGeometry(cs, cs, cs)` per
//     wall cell in the cube. We do NOT draw a floor / ceiling —
//     spec §6 says the player flies through the cube in 6
//     directions, so a flat floor would clip the down view and a
//     ceiling would be inside walls half the time anyway.
//   - `exit` is a small green emissive box at the exit cell
//     (centered on the cell, hovering 0.5m above the cell center
//     to be visible from any direction in the cube).
//   - `playerMarker` is a flat ring on the y=startY plane at the
//     start cell's (x, z) — the player sees a green halo on
//     whatever level they spawn on. The y level shifts as the
//     player moves up / down so the marker always shows their
//     current (x, z) at their current y.
//   - `pickups`, `enemies`, `traps`, `doors`, `transitions`,
//     `warningRings` are all `[]` for P4a. The 3D MVP doesn't
//     place any entities; the engine's update path branches on
//     `maze.walls3D !== undefined` and skips every per-entity
//     check accordingly.
//   - `setWarningFlashState` is a no-op closure — the 3D path
//     doesn't have a hole-down warning (P3-2 is 2D-only).
//   - `setDarkMode` is shared with the 2D palette.
//
// `disposeScene` is the SAME function as the 2D path — it walks
// the scene graph and disposes every mesh's geometry + material,
// so the per-call reference arrays (walls[] / transitions[] / etc.)
// being empty is fine: the for-loop just doesn't iterate.
//
// Performance: visualSize=9 → 729 cells, half walls → ~365 cuboid
// meshes. Each mesh is a separate THREE.Mesh but they all share
// one geometry + one material (hoisted outside the loop), so the
// GPU sees 365 instances of the same BoxGeometry. The draw call
// cost is ~365 per frame, which is well under the 1000-call
// budget for first-person rendering on commodity hardware.
function buildScene3D(maze: MazeData, darkMode: boolean): SceneRefs {
  // F-P4-3D-INVARIANT: the engine routes here ONLY when
  // `maze.walls3D` is defined. A defensive re-check keeps the
  // function from rendering an undefined wall grid if a caller
  // passes a 2D maze by accident.
  const walls3D = maze.walls3D;
  if (walls3D === undefined) {
    throw new Error('buildScene3D: maze.walls3D is undefined (caller routed 2D maze to 3D path)');
  }
  const scene = new THREE.Scene();
  const cs = maze.cellSize;
  const visualSize = walls3D.length;
  // F-P4-3D-CUBOID: cube is `[0, visualSize*cs]` on each axis.
  // BoxGeometry is centered on its position, so wall mesh at
  // `(x+0.5)*cs` occupies exactly `[x*cs, (x+1)*cs]` in its axis —
  // the same cell-center invariant as the 2D renderer.
  const cubeSize = visualSize * cs;

  // Same lighting as 2D. Dark mode is a no-op for P4a (the
  // 3D path doesn't ship the 2D dark palette), but the setter
  // shape is preserved for API consistency.
  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);
  const dir = new THREE.DirectionalLight();
  dir.position.set(cubeSize * 0.6, cubeSize * 0.8, cubeSize * 0.6);
  scene.add(dir);

  // Walls: one BoxGeometry per wall cell. We share the geometry
  // + material across all walls so the GPU sees N instances of
  // the same buffers (sparse draw, no per-cell allocation). The
  // `walls` array is the dispose-side reference handle; the
  // shared geometry / material are disposed by the dispose
  // helper's `seenGeoms` / `seenMats` dedupe.
  const wallTex = createWallTexture();
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const wallGeom = new THREE.BoxGeometry(cs, cs, cs);
  const walls: THREE.Mesh[] = [];
  for (let z = 0; z < visualSize; z++) {
    for (let y = 0; y < visualSize; y++) {
      for (let x = 0; x < visualSize; x++) {
        if (walls3D[z][y][x] !== 1) continue;
        const mesh = new THREE.Mesh(wallGeom, wallMat);
        // F-P4-3D-CELL-CENTER: place the cuboid at the cell
        // center `(x+0.5)*cs` so the box occupies
        // `[x*cs, (x+1)*cs]` on its axis. Matches the 2D
        // cell-center invariant.
        mesh.position.set((x + 0.5) * cs, (y + 0.5) * cs, (z + 0.5) * cs);
        scene.add(mesh);
        walls.push(mesh);
      }
    }
  }

  // F-P4-3D-EXIT: the exit pad is a small emissive green box
  // anchored at the exit cell's center. We default to
  // `exit3D` (the 3D cell coords); if a hand-crafted level
  // provides only the 2D `exit` field, fall back to its
  // (x, z) projection at y=0 (so 3D levels without
  // `exit3D` still display the exit at the ground layer).
  // The pad hovers `cs * 0.3` above the cell center so it's
  // visible from any direction in the cube — a flat pad on
  // the cell floor would be hidden by the cell's walls.
  const exit3D = maze.exit3D ?? { x: maze.exit.x, y: 0, z: maze.exit.z };
  const exitMat = new THREE.MeshLambertMaterial({
    color: 0x5cff5c,
    emissive: 0x115511,
  });
  const exitGeom = new THREE.BoxGeometry(cs * 0.4, cs * 0.4, cs * 0.4);
  const exit = new THREE.Mesh(exitGeom, exitMat);
  exit.position.set(
    (exit3D.x + 0.5) * cs,
    (exit3D.y + 0.5) * cs + cs * 0.3,
    (exit3D.z + 0.5) * cs,
  );
  scene.add(exit);

  // F-P4-3D-MARKER: a flat ring on the horizontal plane at
  // the player's current y. The ring is created at the
  // START cell; the engine updates its x / z each frame
  // (same as the 2D path) but the engine's 3D tick also
  // updates its y when the player moves up / down so the
  // marker always glues to the player's current cell.
  const start3D = maze.start3D ?? { x: maze.start.x, y: 0, z: maze.start.z };
  const playerMarkerGeom = new THREE.RingGeometry(cs * 0.3, cs * 0.4, 24);
  const playerMarkerMat = new THREE.MeshBasicMaterial({
    color: 0x4dff88,
    side: THREE.DoubleSide,
  });
  const playerMarker = new THREE.Mesh(playerMarkerGeom, playerMarkerMat);
  playerMarker.rotation.x = -Math.PI / 2;
  playerMarker.position.set(
    (start3D.x + 0.5) * cs,
    (start3D.y + 0.5) * cs,
    (start3D.z + 0.5) * cs,
  );
  scene.add(playerMarker);

  // F-P4-3D-NO-ENTITIES: P4a is the data + 6-direction
  // movement MVP. Pickups / enemies / traps / doors /
  // transitions are all 2D concepts; the 3D path doesn't
  // carry them. The empty arrays match the SceneRefs
  // contract so the engine's per-entity update branches
  // (which skip on `maze.walls3D !== undefined`) never
  // touch these.
  const pickups: THREE.Mesh[] = [];
  const enemies: THREE.Mesh[] = [];
  const traps: THREE.Mesh[] = [];
  const doors = new Map<string, THREE.Mesh>();
  const transitions: THREE.Mesh[] = [];
  const warningRings: THREE.Mesh[] = [];

  // P3-2: warning flash is 2D-only. The 3D builder returns
  // a no-op closure so the engine's `setWarningFlashState(t)`
  // call (P3-2 contract) doesn't throw on a 3D maze. The
  // `null` clear on level reset is also a no-op.
  const setWarningFlashState = (_t: VerticalTransition | null): void => {
    // intentional no-op
  };

  // Same dark-mode setter as the 2D path. P4a doesn't ship
  // a 3D-specific dark palette; the setter is preserved for
  // API consistency so the engine's `setDarkMode` call site
  // doesn't need a 3D-specific branch.
  const setDarkMode = (enabled: boolean): void => {
    if (enabled) {
      scene.background = new THREE.Color(0x0a0a14);
    } else {
      scene.background = new THREE.Color(0x87ceeb);
    }
  };
  setDarkMode(darkMode);

  return {
    scene,
    walls,
    exit,
    pickups,
    enemies,
    traps,
    doors,
    playerMarker,
    transitions,
    warningRings,
    setWarningFlashState,
    setDarkMode,
  };
}
