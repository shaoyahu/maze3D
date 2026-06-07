import * as THREE from 'three';

export function createCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 100);
  cam.position.set(0, 1.6, 0);
  return cam;
}
