import * as THREE from 'three';

export interface PlayerState {
  position: { x: number; z: number };
  yaw: number;
  pitch: number;
  speed: number;
  radius: number;
}

export function createPlayer(startCell: { x: number; z: number }, cellSize: number): PlayerState {
  return {
    position: { x: startCell.x * cellSize, z: startCell.z * cellSize },
    yaw: 0,
    pitch: 0,
    speed: 3,
    radius: 0.3,
  };
}

export function applyLook(player: PlayerState, mouse: { x: number; y: number }) {
  player.yaw -= mouse.x;
  player.pitch -= mouse.y;
  player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
}

export function updatePlayerCamera(camera: THREE.PerspectiveCamera, player: PlayerState): void {
  camera.position.set(player.position.x, 1.6, player.position.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}
