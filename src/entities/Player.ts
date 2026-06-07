import * as THREE from 'three';

// Single source of truth for the player's collision radius. Imported by
// JsonMazeProvider to derive MIN_CELL_SIZE so the validation can't silently
// drift from the runtime behavior.
export const PLAYER_RADIUS = 0.2;

export interface PlayerState {
  position: { x: number; z: number };
  yaw: number;
  pitch: number;
  speed: number;
  radius: number;
}

export function createPlayer(startCell: { x: number; z: number }, cellSize: number): PlayerState {
  return {
    position: { x: startCell.x * cellSize + cellSize / 2, z: startCell.z * cellSize + cellSize / 2 },
    yaw: 0,
    pitch: 0,
    speed: 3,
    radius: PLAYER_RADIUS,
  };
}

export function applyLook(player: PlayerState, mouse: { x: number; y: number }) {
  // Matches Three.js PointerLockControls convention: `euler.x -= movementY`.
  player.yaw -= mouse.x;
  const TWO_PI = 2 * Math.PI;
  player.yaw = ((player.yaw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  player.pitch -= mouse.y;
  player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
}

const CAMERA_EULER = new THREE.Euler(0, 0, 0, 'YXZ');

export function updatePlayerCamera(camera: THREE.PerspectiveCamera, player: PlayerState): void {
  camera.position.set(player.position.x, 1.6, player.position.z);
  // Reuse a module-level Euler to avoid per-frame allocation. With order
  // 'YXZ', x=pitch, y=yaw, z=roll; pinning z to 0 enforces a level horizon
  // regardless of any prior rotation. The Euler is only read by
  // setFromEuler before the next mutation, so reusing it is safe.
  CAMERA_EULER.set(player.pitch, player.yaw, 0);
  camera.quaternion.setFromEuler(CAMERA_EULER);
}
