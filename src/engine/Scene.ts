import * as THREE from 'three';
import type { MazeData } from '../maze/types';

export interface SceneRefs {
  scene: THREE.Scene;
  walls: THREE.Mesh[];
  exit: THREE.Mesh;
  pickups: THREE.Mesh[];
}

export function buildScene(maze: MazeData): SceneRefs {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2a);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  const floorMat = new THREE.MeshLambertMaterial({ color: 0x6e6e80 });
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xb2a06b });
  const exitMat = new THREE.MeshLambertMaterial({ color: 0x5cff5c, emissive: 0x115511 });
  const pickupMat = new THREE.MeshLambertMaterial({ color: 0xffb84d, emissive: 0x553300 });

  const cs = maze.cellSize;
  const w = maze.size.width;
  const d = maze.size.depth;

  const floorGeom = new THREE.PlaneGeometry(w * cs, d * cs);
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((w * cs) / 2 - cs / 2, 0, (d * cs) / 2 - cs / 2);
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(w * cs, d * cs),
    new THREE.MeshLambertMaterial({ color: 0x2a2a3a }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((w * cs) / 2 - cs / 2, 2.4, (d * cs) / 2 - cs / 2);
  scene.add(ceiling);

  const walls: THREE.Mesh[] = [];
  const wallGeom = new THREE.BoxGeometry(cs, 2.4, cs);
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (maze.walls[z][x] === 1) {
        const m = new THREE.Mesh(wallGeom, wallMat);
        m.position.set(x * cs, 1.2, z * cs);
        scene.add(m);
        walls.push(m);
      }
    }
  }

  const exitGeom = new THREE.BoxGeometry(cs * 0.6, 0.1, cs * 0.6);
  const exit = new THREE.Mesh(exitGeom, exitMat);
  exit.position.set(maze.exit.x * cs, 0.05, maze.exit.z * cs);
  scene.add(exit);

  const pickups: THREE.Mesh[] = [];
  const pickupGeom = new THREE.OctahedronGeometry(0.3);
  for (const p of maze.pickups) {
    const m = new THREE.Mesh(pickupGeom, pickupMat);
    m.position.set(p.x * cs, 0.6, p.z * cs);
    m.userData = { pickup: p };
    scene.add(m);
    pickups.push(m);
  }

  return { scene, walls, exit, pickups };
}

export function disposeScene(
  scene: THREE.Scene,
  walls: THREE.Mesh[],
  exit: THREE.Mesh,
  pickups: THREE.Mesh[],
) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });
  walls.length = 0;
  pickups.length = 0;
  void exit;
}
