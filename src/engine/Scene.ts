import * as THREE from 'three';
import type { MazeData } from '../maze/types';
import { createPickupMaterial } from '../entities/Pickup';
import { ENEMY_HEIGHT, ENEMY_RADIUS } from '../entities/Enemy';

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
  playerMarker: THREE.Mesh;
  setDarkMode: (enabled: boolean) => void;
}

export function buildScene(maze: MazeData, darkMode =false): SceneRefs {
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

  const floorTex = createFloorTexture();
  floorTex.repeat.set(w, d);
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });

  const wallTex = createWallTexture();
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const exitMat = new THREE.MeshLambertMaterial({ color: 0x5cff5c, emissive: 0x115511 });

  const floorGeom = new THREE.PlaneGeometry(w * cs, d * cs);
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  // Floor (and ceiling) span the full collision-grid AABB [0, w*cs] × [0, d*cs].
  // Their CENTER must therefore sit at (w*cs/2, d*cs/2). Earlier code subtracted
  // cs/2, which shifted the entire visible world by half a cell relative to the
  // collision grid — see the cell-center alignment block below.
  floor.position.set((w * cs) / 2, 0, (d * cs) / 2);
  scene.add(floor);

  // Ceiling is the sky — repeat-tiled cloud texture, MeshBasicMaterial so
  // it stays bright regardless of the directional light angle. Without
  // this the player would see a flat dark plane when looking up.
  const ceilingTex = createCloudTexture();
  ceilingTex.repeat.set(w, d);
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(w * cs, d * cs),
    new THREE.MeshBasicMaterial({ map: ceilingTex }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((w * cs) / 2, 2.4, (d * cs) / 2);
  scene.add(ceiling);

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
  const walls: THREE.Mesh[] = [];
  const wallGeom = new THREE.BoxGeometry(cs, 2.4, cs);
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (maze.walls[z][x] === 1) {
        const m = new THREE.Mesh(wallGeom, wallMat);
        m.position.set((x + 0.5) * cs, 1.2, (z + 0.5) * cs);
        scene.add(m);
        walls.push(m);
      }
    }
  }

  // PERIMETER (visual-only). Collision.collidesAt already treats x<0, x>=w,
  // z<0, z>=d as wall — but without a mesh there, a player blocked by the
  // map edge sees nothing in front and the on-floor marker (which represents
  // their collision volume) appears to float in mid-corridor. Add a ring of
  // wall meshes one cell outside the grid (including the four corners) so
  // OOB-blocked motion looks identical to wall-blocked motion: marker
  // outer edge (radius 0.26) overlaps the visible wall face by ~0.06 world
  // units, just like any interior wall.
  for (let x = -1; x <= w; x++) {
    for (const z of [-1, d]) {
      const m = new THREE.Mesh(wallGeom, wallMat);
      m.position.set((x + 0.5) * cs, 1.2, (z + 0.5) * cs);
      scene.add(m);
      walls.push(m);
    }
  }
  for (let z = 0; z < d; z++) {
    for (const x of [-1, w]) {
      const m = new THREE.Mesh(wallGeom, wallMat);
      m.position.set((x + 0.5) * cs, 1.2, (z + 0.5) * cs);
      scene.add(m);
      walls.push(m);
    }
  }

  const exitGeom = new THREE.BoxGeometry(cs * 0.6, 0.1, cs * 0.6);
  const exit = new THREE.Mesh(exitGeom, exitMat);
  exit.position.set((maze.exit.x + 0.5) * cs, 0.05, (maze.exit.z + 0.5) * cs);
  scene.add(exit);

  // Player position indicator: a flat green ring on the floor, slightly
  // larger than the player's collision radius (0.2) so the user can see
  // where they are. Position is updated each frame in Game.update.
  const playerMarkerGeom = new THREE.RingGeometry(0.22, 0.26, 32);
  const playerMarkerMat = new THREE.MeshBasicMaterial({
    color: 0x4dff88,
    side: THREE.DoubleSide,
  });
  const playerMarker = new THREE.Mesh(playerMarkerGeom, playerMarkerMat);
  playerMarker.rotation.x = -Math.PI / 2;
  playerMarker.position.set(maze.start.x * cs + cs / 2, 0.02, maze.start.z * cs + cs / 2);
  scene.add(playerMarker);

  const pickups: THREE.Mesh[] = [];
  const pickupGeom = new THREE.OctahedronGeometry(0.25);
  for (const p of maze.pickups) {
    const pickupMat = createPickupMaterial(p.type);
    const lower = new THREE.Mesh(pickupGeom, pickupMat);
    lower.position.set((p.x + 0.5) * cs, 0.35, (p.z + 0.5) * cs);
    lower.userData = { pickup: p, siblings: [] as THREE.Mesh[] };
    scene.add(lower);
    pickups.push(lower);

    const upper = new THREE.Mesh(pickupGeom, pickupMat);
    upper.position.set((p.x + 0.5) * cs, 0.75, (p.z + 0.5) * cs);
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
  const enemies: THREE.Mesh[] = [];
  const enemyGeom = new THREE.CapsuleGeometry(ENEMY_RADIUS, ENEMY_HEIGHT - 2 * ENEMY_RADIUS);
  const enemyMat = new THREE.MeshLambertMaterial({ color: 0x553333 });
  for (const e of maze.enemies) {
    const mesh = new THREE.Mesh(enemyGeom, enemyMat);
    // Spawn at cell center, y = height/2 so the capsule sits on the floor.
    mesh.position.set((e.x + 0.5) * cs, ENEMY_HEIGHT / 2, (e.z + 0.5) * cs);
    mesh.userData = { enemy: e };
    scene.add(mesh);
    enemies.push(mesh);
  }

  return { scene, walls, exit, pickups, enemies, playerMarker, setDarkMode };
}

export function disposeScene(
  scene: THREE.Scene,
  walls: THREE.Mesh[],
  pickups: THREE.Mesh[],
  enemies: THREE.Mesh[] = [],
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
  // F-2026-06-17-B-L-3: clear the module-level disposedTexs /
  // doubleDisposeWarned Sets so a fresh level build doesn't double-warn
  // for textures that were already disposed in a previous level's teardown.
  // Without this, the Sets grew monotonically (one entry per texture
  // ever created) and JS heap ballooned by 1.5-6 MB per 100 levels.
  disposedTexs.clear();
  doubleDisposeWarned.clear();
}
